import { Suspense, useEffect, useRef, useState, type ComponentType, type LazyExoticComponent } from "react";

export function LazyPreview({ Component }: { Component: ComponentType | LazyExoticComponent<ComponentType> }) {
  const [visible, setVisible] = useState(false);
  const previewRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) return;

    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "360px 0px" }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="preview-area" data-testid="preview-area" ref={previewRef}>
      {visible ? (
        <Suspense fallback={<div className="preview-loading">예제 불러오는 중</div>}>
          <Component />
        </Suspense>
      ) : (
        <div className="preview-loading">예제 준비 중</div>
      )}
    </div>
  );
}
