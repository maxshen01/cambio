// Adapts turns, peeks, and blind swaps to authorized views and ordered notifications.
import { drawCard, discardDrawnCard, swapDrawnCard } from "../../game/turns/actions.js";
import {
    usePower,
    choosePowerTargets,
    skipPower,
    finishPowerPeek,
    choosePowerSwap,
} from "../../game/turns/powers.js";
import { toDrawnCardView } from "../../game/views/drawnCardView.js";
import { toPowerPeekResult } from "../../game/views/powerPeekView.js";
import { PLAYER_ROOM } from "../rooms.js";
import { logSocket } from "../log.js";

/** Register deck/discard and power actions through the shared error boundary.
 * @param {import('../types.js').GameServer} io
 * @param {import('../types.js').GameSocket} socket
 * @param {import('../../game/types.js').GameState} state
 * @param {import('../types.js').GameBoundary} run
 * @param {() => number} [random]
 */
export function registerTurns(io, socket, state, run, random = Math.random) {
    socket.on("drawCard", (payload) =>
        run(socket, "drawCard", () => {
            const player = drawCard(state, socket.id, payload, random);
            for (const recipient of state.players) {
                io.sockets.sockets
                    .get(recipient.id)
                    ?.emit("cardDrawn", toDrawnCardView(player, recipient.id));
            }
            if (player.drawnFrom === "deck" && player.drawnCard?.power) {
                socket.emit("powerAvailable", { power: player.drawnCard.power });
            }
            if (player.drawnFrom === "discard") publishDiscardPile();
            logSocket("info", socket.id, "drawCard", "accepted", {
                source: player.drawnFrom === "discard" ? "discard" : "deck",
            });
        }),
    );

    /** Publish only the visible top, never buried cards or pile counts. */
    function publishDiscardPile() {
        const top = state.discardPile.cards.at(-1);
        io.to(PLAYER_ROOM).emit("discardPileUpdated", {
            top: top ? { cardId: top.cardId } : null,
        });
    }

    /** Publish resolution immediately; animations never gate server progression. */
    function publishResolution() {
        publishDiscardPile();
        io.to(PLAYER_ROOM).emit("turnChanged", {
            playerId: /** @type {string} */ (state.turn),
        });
    }
    socket.on("discardDrawnCard", () =>
        run(socket, "discardDrawnCard", () => {
            const result = discardDrawnCard(state, socket.id, random);
            if (result.kind === "powerStarted") {
                io.to(PLAYER_ROOM).emit("powerResolutionStarted", {
                    playerId: result.playerId,
                });
                socket.emit("powerAvailable", { power: result.power });
            } else publishResolution();
            logSocket("info", socket.id, "discardDrawnCard", "accepted", {
                resolution: result.kind,
            });
        }),
    );
    socket.on("usePower", () =>
        run(socket, "usePower", () => {
            const started = usePower(state, socket.id);
            if (started) io.to(PLAYER_ROOM).emit("powerResolutionStarted", { playerId: socket.id });
            const player = state.players.find(
                (player) => player.id === socket.id,
            );
            if (!player) throw new Error("Power user missing after validation");
            const held = toDrawnCardView(player, socket.id);
            if (!held.faceUp)
                throw new Error("Power card not revealed after use");
            io.to(PLAYER_ROOM).emit("powerCardRevealed", {
                playerId: held.playerId,
                faceUp: true,
                cardId: held.cardId,
            });
            logSocket("info", socket.id, "usePower", "accepted");
        }),
    );
    socket.on("choosePowerTargets", (payload) =>
        run(socket, "choosePowerTargets", () => {
            const result = choosePowerTargets(
                state,
                socket.id,
                payload,
                random,
            );
            if (result.kind === "swap") {
                io.to(PLAYER_ROOM).emit("cardSwapped", {
                    kind: "power",
                    first: result.first,
                    second: result.second,
                });
                publishResolution();
            } else {
                for (const recipient of state.players) {
                    io.sockets.sockets
                        .get(recipient.id)
                        ?.emit(
                            "powerPeekResult",
                            toPowerPeekResult(result, socket.id, recipient.id),
                        );
                }
            }
            logSocket("info", socket.id, "choosePowerTargets", "accepted");
        }),
    );
    socket.on("skipPower", () =>
        run(socket, "skipPower", () => {
            skipPower(state, socket.id, random);
            publishResolution();
            logSocket("info", socket.id, "skipPower", "accepted");
        }),
    );
    socket.on("finishPowerPeek", () =>
        run(socket, "finishPowerPeek", () => {
            const result = finishPowerPeek(state, socket.id, random);
            if (result.completed) publishResolution();
            logSocket("info", socket.id, "finishPowerPeek", "accepted");
        }),
    );
    socket.on("choosePowerSwap", (payload) =>
        run(socket, "choosePowerSwap", () => {
            const result = choosePowerSwap(state, socket.id, payload, random);
            io.to(PLAYER_ROOM).emit("cardSwapped", {
                kind: "power",
                first: result.first,
                second: result.second,
            });
            publishResolution();
            logSocket("info", socket.id, "choosePowerSwap", "accepted");
        }),
    );
    socket.on("swapDrawnCard", (payload) =>
        run(socket, "swapDrawnCard", () => {
            const handSlotId = swapDrawnCard(state, socket.id, payload, random);
            io.to(PLAYER_ROOM).emit("cardSwapped", {
                kind: "drawn",
                target: { playerId: socket.id, handSlotId },
            });
            publishResolution();
            logSocket("info", socket.id, "swapDrawnCard", "accepted", {
                handSlotId,
            });
        }),
    );
}
