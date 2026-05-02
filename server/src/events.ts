import { EventEmitter } from "node:events";
import type { WsServerEvent } from "./types.js";

class TypedBus extends EventEmitter {
  emitEvent(ev: WsServerEvent) {
    this.emit("event", ev);
  }
  onEvent(handler: (ev: WsServerEvent) => void) {
    this.on("event", handler);
    return () => this.off("event", handler);
  }
}

export const bus = new TypedBus();
bus.setMaxListeners(50);
