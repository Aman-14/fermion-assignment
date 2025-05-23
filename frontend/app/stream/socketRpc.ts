import { Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./types";

/**
 * Utility function to call a Socket.IO RPC-style event and get a Promise response.
 * @param socket The Socket.IO socket
 * @param eventName The event name to emit (must match server event)
 * @param payload The payload to send (or undefined if none)
 * @returns Promise resolving with the server response
 */
export function socketRpc<TEvent extends keyof ClientToServerEvents>(
  socket: Socket<ServerToClientEvents, ClientToServerEvents>,
  eventName: TEvent,
  ...args: Parameters<ClientToServerEvents[TEvent]> extends [
    infer P,
    (res: infer U) => void
  ]
    ? [payload: P]
    : []
): Promise<
  Parameters<ClientToServerEvents[TEvent]> extends [any, (res: infer U) => void]
    ? U
    : never
> {
  return new Promise((resolve, reject) => {
    try {
      if (args.length > 0) {
        (socket as any).emit(eventName, args[0], (response: any) => {
          resolve(response);
        });
      } else {
        (socket as any).emit(eventName, (response: any) => {
          resolve(response);
        });
      }
    } catch (err) {
      reject(err);
    }
  });
}
