declare namespace chrome {
  namespace runtime {
    type MessageListener = (message: unknown, sender: { id?: string; tab?: { id?: number } }, sendResponse: (response: unknown) => void) => void | boolean;
    type UpdateAvailableListener = (details: { version: string }) => void;
    const id: string;
    const onMessage: { addListener(listener: MessageListener): void; removeListener(listener: MessageListener): void };
    const onUpdateAvailable: { addListener(listener: UpdateAvailableListener): void; removeListener(listener: UpdateAvailableListener): void };
    function sendMessage(message: unknown): Promise<unknown>;
    function getURL(path?: string): string;
    function getManifest(): { version?: string };
    function reload(): void;
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
    function query(queryInfo?: Record<string, unknown>): Promise<Array<{ id?: number }>>;
    function sendMessage(tabId: number, message: unknown): Promise<unknown>;
  }
}
