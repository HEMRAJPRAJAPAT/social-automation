export interface DiagramBox {
  label: string;
}

export interface DiagramSpec {
  title: string;
  boxes: DiagramBox[];
  layout: 'vertical-flow' | 'horizontal-flow';
}

export type VisualScene =
  | { lineIndex: number; type: 'stock'; stockKeywords: string[] }
  | { lineIndex: number; type: 'diagram'; diagramSpec: DiagramSpec };

export interface VisualPlan {
  scenes: VisualScene[];
}
