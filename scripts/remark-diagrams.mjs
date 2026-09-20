// Keep Mermaid source as text, not executable HTML. Works in both MD and MDX.
export default function diagrams() {
  return function transform(tree) {
    function walk(node) {
      if (node.type === 'code' && node.lang === 'mermaid') {
        const value = node.value;
        Object.keys(node).forEach(key => delete node[key]);
        Object.assign(node, { type: 'paragraph',
          data: { hName: 'pre', hProperties: { className: ['mermaid'], 'aria-label': '流程图' } },
          children: [{ type: 'text', value }] });
      }
      node.children?.forEach(walk);
    }
    walk(tree);
  };
}
