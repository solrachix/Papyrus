
import { PapyrusEventType, PapyrusEventListener, EventPayloads } from '@papyrus-sdk/types';

export class PapyrusEventEmitter {
  private listeners: Map<PapyrusEventType, Set<PapyrusEventListener<any>>> = new Map();

  on<T extends PapyrusEventType>(event: T, listener: PapyrusEventListener<T>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return an unsubscribe function
    return () => this.off(event, listener);
  }

  off<T extends PapyrusEventType>(event: T, listener: PapyrusEventListener<T>): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
    }
  }

  emit<T extends PapyrusEventType>(event: T, payload: EventPayloads[T]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach((listener) => listener(payload));
    }
  }
}

// Singleton instance for the core package
export const papyrusEvents = new PapyrusEventEmitter();
