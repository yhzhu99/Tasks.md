export function rememberScroll(selector) {
  const entries = [...document.querySelectorAll(selector)].map((el) => ({
    el,
    top: el.scrollTop,
    left: el.scrollLeft,
  }));
  return () => {
    const apply = (useFresh) => {
      const nodes = useFresh ? [...document.querySelectorAll(selector)] : [];
      entries.forEach((entry, index) => {
        const el = entry.el.isConnected ? entry.el : nodes[index];
        if (!el) return;
        el.scrollTop = entry.top;
        el.scrollLeft = entry.left;
      });
    };
    apply(false);
    requestAnimationFrame(() => apply(true));
  };
}
