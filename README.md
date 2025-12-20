
# 📜 Papyrus PDF SDK
> **The Last PDF Engine You'll Ever Need.** 

[![Engine: PDF.js](https://img.shields.io/badge/Engine-PDF.js-orange.svg)](https://mozilla.github.io/pdf.js/)
[![Framework: React](https://img.shields.io/badge/Framework-React-blue.svg)](https://reactjs.org/)

O **Papyrus** não é apenas mais um visualizador de PDF; é um **SDK Modular de Próxima Geração** construído para ser o coração de ferramentas como Figma, Notion e PDFTron.

---

## 📚 Documentação

- [**Guia de Configuração**](./docs/CONFIGURATION.md) — Aprenda a customizar temas, zoom inicial e anotações.
- [**Event Hooks**](./docs/CONFIGURATION.md#event-hooks) — Como integrar o Papyrus com seu backend e analytics.

---

## 🔥 Funcionalidades Profissionais

- [x] **Event Hooks:** Escute mudanças de página, zoom e anotações criadas programaticamente.
- [x] **Busca Textual Profissional:** Serviço de busca em background com preview.
- [x] **Temas Inteligentes:** Dark Mode real, Sépia e Alto Contraste.
- [x] **Arquitetura Desacoplada:** Core agnóstico, UI em React e Engine PDF.js separadas.

---

## 🏗️ Arquitetura

| Pacote | Responsabilidade |
| :--- | :--- |
| `@papyrus/types` | Interfaces e definições globais (Contratos). |
| `@papyrus/core` | Estado global (Zustand), EventEmitter e SearchService. |
| `@papyrus/engine-pdfjs` | Adaptador técnico para o PDF.js. |
| `@papyrus/ui-react` | Componentes visuais de alta performance. |

---

**Papyrus: Onde o papel encontra o futuro.**
# Papyrus
