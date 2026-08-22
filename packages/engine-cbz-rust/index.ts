import {
  ComicArchive,
  ComicEngine,
  ComicEngineOptions,
  comicMimeTypeForName,
  resolveComicSourceToBlob,
} from "@papyrus-sdk/engine-comic-core";
import { openZipComicArchive } from "@papyrus-sdk/engine-cbz";
import { DocumentSource } from "@papyrus-sdk/types";

export interface RustCbzRuntime {
  readonly pageCount: number;
  pageName(pageIndex: number): string;
  pageSize(pageIndex: number): number;
  readPage(pageIndex: number): Uint8Array;
  destroy?(): void;
}

export interface RustCbzRuntimeFactory {
  load(bytes: Uint8Array): Promise<RustCbzRuntime>;
}

export interface RustCBZEngineOptions extends ComicEngineOptions {
  runtimeFactory?: RustCbzRuntimeFactory;
}

export interface WasmRustCbzCore {
  page_count(): number;
  page_name(pageIndex: number): string;
  page_size(pageIndex: number): number;
  read_page(pageIndex: number): Uint8Array;
  free?(): void;
}

export interface WasmRustCbzModule {
  default?(moduleOrPath?: unknown): Promise<unknown> | unknown;
  WasmCbzCore: new (bytes: Uint8Array) => WasmRustCbzCore;
}

type WasmModulePathResolver = () => unknown;

export function createWasmRustCbzRuntimeFactory(
  loadModule: () => Promise<WasmRustCbzModule>,
  resolveModulePath?: WasmModulePathResolver
): RustCbzRuntimeFactory {
  return {
    async load(bytes) {
      const module = await loadModule();
      if (module.default) await module.default(resolveModulePath?.());
      let core: WasmRustCbzCore | null = new module.WasmCbzCore(bytes);
      return {
        get pageCount() {
          return core?.page_count() ?? 0;
        },
        pageName: (pageIndex) => core?.page_name(pageIndex) ?? "",
        pageSize: (pageIndex) => Number(core?.page_size(pageIndex) ?? 0),
        readPage: (pageIndex) => core?.read_page(pageIndex) ?? new Uint8Array(),
        destroy: () => {
          if (!core) return;
          const currentCore = core;
          core = null;
          try {
            currentCore.free?.();
          } catch (error) {
            console.warn("[RustCBZEngine] Falha ao liberar runtime", error);
          }
        },
      };
    },
  };
}

function resolveBundledWasmModule(): unknown {
  if (typeof __dirname !== "string" || typeof require !== "function") {
    return undefined;
  }

  return {
    module_or_path: require("node:fs").readFileSync(
      `${__dirname}/papyrus_cbz_rust_bg.wasm`
    ),
  };
}

export function createBundledWasmRustCbzRuntimeFactory(): RustCbzRuntimeFactory {
  return createWasmRustCbzRuntimeFactory(async () =>
    import("./wasm/papyrus_cbz_rust.js") as unknown as Promise<WasmRustCbzModule>,
    resolveBundledWasmModule
  );
}

export class RustCBZEngine extends ComicEngine {
  private readonly runtimeFactory: RustCbzRuntimeFactory;

  constructor(options: RustCBZEngineOptions = {}) {
    super(options);
    this.runtimeFactory =
      options.runtimeFactory ?? createBundledWasmRustCbzRuntimeFactory();
  }

  protected async openArchive(source: DocumentSource): Promise<ComicArchive> {
    const blob = await resolveComicSourceToBlob(source);
    const bytes = new Uint8Array(await blob.arrayBuffer());

    try {
      const runtime = await this.runtimeFactory.load(bytes);
      let fallbackArchive: Promise<ComicArchive> | null = null;
      const readFallbackPage = async (name: string): Promise<Blob> => {
        fallbackArchive ??= openZipComicArchive(source);
        const archive = await fallbackArchive;
        const entry = archive.entries.find(
          (candidate) =>
            candidate.name.replaceAll("\\", "/") === name.replaceAll("\\", "/")
        );
        if (!entry) {
          throw new Error(`Página não encontrada no fallback zip.js: ${name}`);
        }
        return entry.read();
      };

      return {
        entries: Array.from({ length: runtime.pageCount }, (_, pageIndex) => {
          const name = runtime.pageName(pageIndex);
          return {
            name,
            size: runtime.pageSize(pageIndex),
            read: async () => {
              try {
                const pageBytes = runtime.readPage(pageIndex);
                const blobBytes = new Uint8Array(pageBytes.byteLength);
                blobBytes.set(pageBytes);
                return new Blob([blobBytes.buffer], {
                  type: comicMimeTypeForName(name),
                });
              } catch (error) {
                console.warn(
                  "[RustCBZEngine] Falha ao extrair página; usando zip.js",
                  error
                );
                return readFallbackPage(name);
              }
            },
          };
        }),
        dispose: async () => {
          runtime.destroy?.();
          const archive = await fallbackArchive;
          await archive?.dispose?.();
        },
      };
    } catch (error) {
      console.warn("[RustCBZEngine] WASM indisponível; usando zip.js", error);
      return openZipComicArchive(source);
    }
  }
}

export { ComicEngine } from "@papyrus-sdk/engine-comic-core";
