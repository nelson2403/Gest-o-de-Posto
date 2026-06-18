// Helpers para renderizar planos de conta como árvore hierárquica baseada
// no código separado por ponto (ex.: 1, 1.1, 1.1.001). Funciona tanto para
// o plano AUTOSYSTEM quanto para o plano contábil importado — a única
// premissa é que cada item tenha um campo `codigo: string`.

export interface TreeNode<T> {
  item: T
  codigo: string
  children: TreeNode<T>[]
  depth: number
}

/**
 * Constrói árvore por prefixo de código. Para cada item, encontra o pai como
 * sendo o maior prefixo (separado por `.`) que exista entre os outros itens.
 * Se não houver pai existente, o item é tratado como raiz.
 */
export function buildTreeFromCodigos<T extends { codigo: string }>(items: T[]): TreeNode<T>[] {
  // Ordenação numeric/PT-BR garante que "1.1.2" venha antes de "1.1.10" e
  // que pais venham antes de filhos quando os prefixos batem.
  const sorted = [...items].sort((a, b) =>
    a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true, sensitivity: 'base' }),
  )

  const byCodigo = new Map<string, TreeNode<T>>()
  for (const item of sorted) {
    if (!byCodigo.has(item.codigo)) {
      byCodigo.set(item.codigo, { item, codigo: item.codigo, children: [], depth: 0 })
    }
  }

  const roots: TreeNode<T>[] = []
  for (const node of byCodigo.values()) {
    const parts = node.codigo.split('.')
    let parent: TreeNode<T> | null = null
    for (let i = parts.length - 1; i >= 1; i--) {
      const cand = parts.slice(0, i).join('.')
      const p = byCodigo.get(cand)
      if (p) { parent = p; break }
    }
    if (parent) {
      node.depth = parent.depth + 1
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

/**
 * Dado um conjunto de códigos que passaram em algum filtro/busca, retorna
 * o conjunto de TODOS os códigos que devem ficar visíveis (matches +
 * ancestrais para preservar o caminho até a raiz).
 */
export function visiveisComAncestrais<T>(
  roots: TreeNode<T>[],
  matches: Set<string>,
): Set<string> {
  const visiveis = new Set<string>()

  function descender(node: TreeNode<T>): boolean {
    let temMatch = matches.has(node.codigo)
    for (const c of node.children) {
      if (descender(c)) temMatch = true
    }
    if (temMatch) visiveis.add(node.codigo)
    return temMatch
  }

  for (const r of roots) descender(r)
  return visiveis
}

/**
 * Linearização da árvore para render. Respeita `expanded` e (opcionalmente)
 * filtra por `visiveis`. Se `visiveis` for null, todos os nós são candidatos.
 */
export function flattenTree<T>(
  roots: TreeNode<T>[],
  expanded: Set<string>,
  visiveis: Set<string> | null,
): TreeNode<T>[] {
  const out: TreeNode<T>[] = []

  function walk(node: TreeNode<T>) {
    if (visiveis && !visiveis.has(node.codigo)) return
    out.push(node)
    if (expanded.has(node.codigo)) {
      for (const c of node.children) walk(c)
    }
  }

  for (const r of roots) walk(r)
  return out
}

/** Conjunto de todos os códigos da árvore — usado por "Expandir tudo". */
export function todosOsCodigosNonLeaves<T>(roots: TreeNode<T>[]): Set<string> {
  const s = new Set<string>()
  function walk(node: TreeNode<T>) {
    if (node.children.length > 0) s.add(node.codigo)
    for (const c of node.children) walk(c)
  }
  for (const r of roots) walk(r)
  return s
}
