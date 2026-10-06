import { Locale } from "@papyrus-sdk/types";

type Strings = {
  pages: string;
  contents: string;
  progress: string;
  search: string;
  notes: string;
  select: string;
  underline: string;
  squiggly: string;
  strikeout: string;
  ink: string;
  color: string;
  tools: string;
  read: string;
  edit: string;
  done: string;
  page: string;
  summary: string;
  pagesTab: string;
  summaryTab: string;
  searchPlaceholder: string;
  searchGo: string;
  allResults: string;
  results: string;
  searching: string;
  noResults: string;
  noSummary: string;
  noAnnotations: string;
  untitled: string;
  pageTransition: string;
  continuous: string;
  pageByPage: string;
  layout: string;
  singlePage: string;
  doublePage: string;
  rotate: string;
  clockwise: string;
  counterclockwise: string;
  rotationOriginal: string;
  zoom: string;
  highlight: string;
  strike: string;
  text: string;
  note: string;
  editNote: string;
  notePlaceholder: string;
  cancel: string;
  save: string;
  language: string;
  english: string;
  portuguese: string;
  appearance: string;
  light: string;
  dark: string;
  pageTheme: string;
  themeOriginal: string;
  themeSepia: string;
  themeDark: string;
  themeContrast: string;
  info: string;
  more: string;
  close: string;
  copy: string;
  define: string;
  annotate: string;
  annotationHighlight: string;
  annotationUnderline: string;
  annotationStrikeout: string;
  annotationSquiggly: string;
  annotationNote: string;
  deleteAnnotation: string;
  previousPage: string;
  nextPage: string;
  comicMode: string;
  comicSingle: string;
  comicContinuous: string;
  comicFit: string;
  comicFitWidth: string;
  comicFitPage: string;
  comicDirection: string;
  comicLtr: string;
  comicRtl: string;
  comicPageError: string;
};

const STRINGS: Record<Locale, Strings> = {
  en: {
    pages: "Pages",
    contents: "Contents",
    progress: "Progress",
    search: "Search",
    notes: "Notes",
    select: "Select",
    underline: "Underline",
    squiggly: "Squiggly",
    strikeout: "Strikeout",
    ink: "Ink",
    color: "Color",
    tools: "Tools",
    read: "Read",
    edit: "Edit",
    done: "Done",
    page: "Page",
    summary: "Summary",
    pagesTab: "Pages",
    summaryTab: "Summary",
    searchPlaceholder: "Search text...",
    searchGo: "Go",
    allResults: "All results",
    results: "results",
    searching: "Searching...",
    noResults: "No results yet.",
    noSummary: "No summary available.",
    noAnnotations: "No annotations yet.",
    untitled: "Untitled",
    pageTransition: "Page transition",
    continuous: "Continuous",
    pageByPage: "Page by page",
    layout: "Layout",
    singlePage: "Single page",
    doublePage: "Double page",
    rotate: "Rotate",
    clockwise: "Clockwise",
    counterclockwise: "Counterclockwise",
    rotationOriginal: "Original / 0°",
    zoom: "Zoom",
    highlight: "Highlight",
    strike: "Strike",
    text: "Text",
    note: "Note",
    editNote: "Edit note",
    notePlaceholder: "Write your note...",
    cancel: "Cancel",
    save: "Save",
    language: "Language",
    english: "English",
    portuguese: "Portuguese (BR)",
    appearance: "Appearance",
    light: "Light",
    dark: "Dark",
    pageTheme: "Page theme",
    themeOriginal: "Original",
    themeSepia: "Sepia",
    themeDark: "Dark",
    themeContrast: "High contrast",
    info: "Info",
    more: "More",
    close: "Close",
    copy: "Copy",
    define: "Define",
    annotate: "Annotate",
    annotationHighlight: "Highlight",
    annotationUnderline: "Underline",
    annotationStrikeout: "Strikeout",
    annotationSquiggly: "Squiggly",
    annotationNote: "Note",
    deleteAnnotation: "Delete",
    previousPage: "Previous page",
    nextPage: "Next page",
    comicMode: "Comic layout",
    comicSingle: "Single page",
    comicContinuous: "Continuous",
    comicFit: "Page fit",
    comicFitWidth: "Fit width",
    comicFitPage: "Fit page",
    comicDirection: "Reading direction",
    comicLtr: "Left to right",
    comicRtl: "Right to left / Manga",
    comicPageError: "This comic page could not be displayed.",
  },
  "pt-BR": {
    pages: "Paginas",
    contents: "Conteúdo",
    progress: "Progresso",
    search: "Buscar",
    notes: "Notas",
    select: "Selecionar",
    underline: "Sublinhar",
    squiggly: "Ondulado",
    strikeout: "Riscado",
    ink: "Tinta",
    color: "Cor",
    tools: "Ferramentas",
    read: "Ler",
    edit: "Editar",
    done: "Concluir",
    page: "Pagina",
    summary: "Sumario",
    pagesTab: "Paginas",
    summaryTab: "Sumario",
    searchPlaceholder: "Pesquisar texto...",
    searchGo: "Buscar",
    allResults: "Todos os resultados",
    results: "resultados",
    searching: "Pesquisando...",
    noResults: "Nenhum resultado.",
    noSummary: "Sem sumario.",
    noAnnotations: "Sem anotacoes.",
    untitled: "Sem titulo",
    pageTransition: "Transicao de pagina",
    continuous: "Continuo",
    pageByPage: "Pagina por pagina",
    layout: "Layout",
    singlePage: "Pagina unica",
    doublePage: "Pagina dupla",
    rotate: "Girar",
    clockwise: "Sentido horario",
    counterclockwise: "Sentido anti-horario",
    rotationOriginal: "Original / 0°",
    zoom: "Zoom",
    highlight: "Marca texto",
    strike: "Risco",
    text: "Texto",
    note: "Nota",
    editNote: "Editar nota",
    notePlaceholder: "Escreva sua nota...",
    cancel: "Cancelar",
    save: "Salvar",
    language: "Idioma",
    english: "Ingles",
    portuguese: "Portugues (BR)",
    appearance: "Aparencia",
    light: "Claro",
    dark: "Escuro",
    pageTheme: "Tema da pagina",
    themeOriginal: "Original",
    themeSepia: "Sepia",
    themeDark: "Escuro",
    themeContrast: "Contraste",
    info: "Info",
    more: "Mais",
    close: "Fechar",
    copy: "Copiar",
    define: "Definir",
    annotate: "Anotar",
    annotationHighlight: "Destacar",
    annotationUnderline: "Sublinhar",
    annotationStrikeout: "Riscar",
    annotationSquiggly: "Ondulado",
    annotationNote: "Nota",
    deleteAnnotation: "Apagar",
    previousPage: "Página anterior",
    nextPage: "Próxima página",
    comicMode: "Layout do quadrinho",
    comicSingle: "Página única",
    comicContinuous: "Contínuo",
    comicFit: "Ajuste da página",
    comicFitWidth: "Ajustar à largura",
    comicFitPage: "Ajustar à página",
    comicDirection: "Direção de leitura",
    comicLtr: "Esquerda para direita",
    comicRtl: "Direita para esquerda / Mangá",
    comicPageError: "Não foi possível exibir esta página do quadrinho.",
  },
};

export const getStrings = (locale: Locale | undefined) =>
  STRINGS[locale ?? "en"] ?? STRINGS.en;
