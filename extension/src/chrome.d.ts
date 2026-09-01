declare namespace chrome {
  namespace runtime {
    type MessageListener = (message: unknown, sender: { tab?: { id?: number } }, sendResponse: (response: unknown) => void) => void | boolean;
    const onMessage: { addListener(listener: MessageListener): void };
    function sendMessage(message: unknown): Promise<unknown>;
  }

  namespace storage {
    namespace local {
      function get(keys: string[]): Promise<Record<string, unknown>>;
      function set(values: Record<string, unknown>): Promise<void>;
      function remove(keys: string[]): Promise<void>;
    }
  }

  namespace tabs {
    function create(createProperties: { url: string }): Promise<{ id?: number }>;
  }
}
