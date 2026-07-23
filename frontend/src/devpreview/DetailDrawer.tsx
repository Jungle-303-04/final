import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { Maximize2, Minimize2, X } from "lucide-react";

import { BLUE, DUR, PRESENT_SCALE, TYPE, UI, blueA, inkA } from "./theme";

const DEFAULT_WIDTH = 560;
const MIN_WIDTH = 460;

export type DetailDrawerTab<T extends string> = {
  id: T;
  label: string;
  disabled?: boolean;
  title?: string;
};

export function DetailDrawerTabs<T extends string>({
  active,
  indicatorId,
  items,
  onChange,
}: {
  active: T;
  indicatorId: string;
  items: readonly DetailDrawerTab<T>[];
  onChange: (tab: T) => void;
}) {
  return (
    <div role="tablist" style={{ display: "flex", gap: 2, marginTop: 14 }}>
      {items.map((item) => {
        const selected = active === item.id;
        return (
          <button
            key={item.id}
            className="product-focusable product-control"
            type="button"
            role="tab"
            aria-selected={selected}
            aria-disabled={item.disabled || undefined}
            disabled={item.disabled}
            title={item.title}
            onClick={() => {
              if (!item.disabled) onChange(item.id);
            }}
            style={{
              position: "relative",
              border: "none",
              background: "transparent",
              cursor: item.disabled ? "not-allowed" : "pointer",
              opacity: item.disabled ? 0.52 : 1,
              padding: "8px 12px 10px",
              fontSize: TYPE.body,
              fontWeight: selected ? 600 : 500,
              color: item.disabled ? UI.ink3 : selected ? UI.ink : UI.ink3,
            }}
          >
            {item.label}
            {selected && (
              <motion.span
                aria-hidden="true"
                layoutId={indicatorId}
                style={{
                  position: "absolute",
                  left: 8,
                  right: 8,
                  bottom: 0,
                  height: 2,
                  borderRadius: 2,
                  background: BLUE,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function DetailDrawer({
  actions,
  ariaLabel,
  bodyRef,
  bodyStyle,
  children,
  expanded,
  forceExpanded = false,
  header,
  leftInset = 0,
  navigation,
  onClose,
  onExpandedChange,
  rightInset = 0,
  topInset = 0,
  viewportWidth,
}: {
  actions?: ReactNode;
  ariaLabel: string;
  bodyRef?: RefObject<HTMLDivElement | null>;
  bodyStyle?: CSSProperties;
  children: ReactNode;
  expanded: boolean;
  forceExpanded?: boolean;
  header: ReactNode;
  leftInset?: number;
  navigation?: ReactNode;
  onClose: () => void;
  onExpandedChange: (expanded: boolean) => void;
  rightInset?: number;
  topInset?: number;
  viewportWidth?: number;
}) {
  const reduceMotion = useReducedMotion();
  const drawerRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const closeRef = useRef(onClose);
  const dragCleanupRef = useRef<() => void>(() => undefined);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [dragging, setDragging] = useState(false);
  const full = expanded || forceExpanded;
  const measuredViewportWidth =
    viewportWidth
    ?? (typeof document !== "undefined"
      ? document.documentElement.clientWidth / PRESENT_SCALE
      : DEFAULT_WIDTH);
  const availableWidth = Math.max(
    0,
    measuredViewportWidth - leftInset - rightInset,
  );
  const renderedWidth = full ? availableWidth : Math.min(width, availableWidth);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const previousRootOverflow = root.style.overflow;
    const previousRootOverscroll = root.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyOverscroll = body.style.overscrollBehavior;
    root.style.overflow = "hidden";
    root.style.overscrollBehavior = "none";
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    return () => {
      root.style.overflow = previousRootOverflow;
      root.style.overscrollBehavior = previousRootOverscroll;
      body.style.overflow = previousBodyOverflow;
      body.style.overscrollBehavior = previousBodyOverscroll;
    };
  }, []);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = previousFocusRef.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    drawerRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => {
        if (
          previousFocus?.isConnected
          && (document.activeElement === document.body || document.activeElement === null)
        ) {
          previousFocus.focus({ preventScroll: true });
        }
      });
    };
  }, []);

  useEffect(() => () => dragCleanupRef.current(), []);

  const onEdgeDown = (event: React.PointerEvent) => {
    if (full) return;
    event.preventDefault();
    setDragging(true);
    const move = (pointerEvent: PointerEvent) => {
      const cssViewportWidth =
        viewportWidth ?? document.documentElement.clientWidth / PRESENT_SCALE;
      const maxWidth = Math.max(
        0,
        cssViewportWidth - leftInset - rightInset,
      );
      const nextWidth =
        cssViewportWidth - rightInset - pointerEvent.clientX / PRESENT_SCALE;
      setWidth(
        Math.min(
          maxWidth,
          Math.max(Math.min(MIN_WIDTH, maxWidth), nextWidth),
        ),
      );
    };
    const cleanup = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cleanup);
      dragCleanupRef.current = () => undefined;
    };
    dragCleanupRef.current();
    dragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
  };
  const setClampedWidth = (nextWidth: number) => {
    const minimum = Math.min(MIN_WIDTH, availableWidth);
    setWidth(Math.min(availableWidth, Math.max(minimum, nextWidth)));
  };
  const onEdgeKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? 40 : 16;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setClampedWidth(width + step);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setClampedWidth(width - step);
    } else if (event.key === "Home") {
      event.preventDefault();
      setClampedWidth(availableWidth);
    } else if (event.key === "End") {
      event.preventDefault();
      setClampedWidth(MIN_WIDTH);
    }
  };

  return (
    <>
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{
          opacity: 0,
          transition: { duration: reduceMotion ? 0 : DUR.micro },
        }}
        transition={{ duration: reduceMotion ? 0 : DUR.fade }}
        onClick={onClose}
        style={{
          position: "fixed",
          top: topInset,
          left: leftInset,
          right: rightInset,
          bottom: 0,
          background: inkA(0.07),
          zIndex: 70,
        }}
      />
      <motion.aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        initial={reduceMotion ? false : { x: 40, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={
          reduceMotion
            ? { opacity: 0 }
            : {
                x: 24,
                opacity: 0,
                transition: {
                  duration: 0.14,
                  ease: [0.4, 0, 1, 1],
                },
              }
        }
        transition={
          reduceMotion
            ? { duration: 0 }
            : { type: "spring", bounce: 0.06, visualDuration: 0.36 }
        }
        style={{
          position: "fixed",
          top: topInset,
          right: rightInset,
          bottom: 0,
          width: renderedWidth,
          maxWidth: availableWidth,
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          background: UI.card,
          borderLeft: `1px solid ${UI.line}`,
          boxShadow: `-24px 0 60px -30px ${inkA(0.3)}`,
          outline: "none",
          zIndex: 71,
          transition: dragging
            ? "none"
            : "right .28s cubic-bezier(.32,.72,0,1), width .28s cubic-bezier(.32,.72,0,1), max-width .28s cubic-bezier(.32,.72,0,1)",
        }}
      >
        {!full && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="상세 패널 폭 조절"
            aria-valuemin={Math.round(Math.min(MIN_WIDTH, availableWidth))}
            aria-valuemax={Math.round(availableWidth)}
            aria-valuenow={Math.round(renderedWidth)}
            tabIndex={0}
            title="드래그하거나 방향키로 폭 조절"
            onPointerDown={onEdgeDown}
            onKeyDown={onEdgeKeyDown}
            className="product-focusable"
            style={{
              position: "absolute",
              left: -2,
              top: 0,
              bottom: 0,
              width: 6,
              cursor: "col-resize",
              zIndex: 5,
              background: dragging ? blueA(0.35) : "transparent",
              transition: "background .15s",
            }}
          />
        )}

        <div
          style={{
            flexShrink: 0,
            padding: "16px 20px 0",
            borderBottom: `1px solid ${UI.line}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ minWidth: 0, flex: 1 }}>{header}</div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                flexShrink: 0,
              }}
            >
              {actions}
              <button
                type="button"
                className="product-focusable product-control"
                aria-label={
                  forceExpanded
                    ? "AI 대화 중에는 전체 화면 유지"
                    : full
                      ? "상세 패널 축소"
                      : "상세 패널 전체 화면"
                }
                title={
                  forceExpanded
                    ? "AI 대화 중에는 전체 화면 유지"
                    : full
                      ? "패널로 축소"
                      : "전체 화면"
                }
                disabled={forceExpanded}
                onClick={() => onExpandedChange(!expanded)}
                style={{
                  width: 28,
                  height: 28,
                  padding: 0,
                  borderRadius: 999,
                  border: "none",
                  background: inkA(0.06),
                  color: UI.ink2,
                  cursor: forceExpanded ? "not-allowed" : "pointer",
                  display: "grid",
                  placeItems: "center",
                  lineHeight: 1,
                }}
              >
                {full ? (
                  <Minimize2 size={14} strokeWidth={2.2} />
                ) : (
                  <Maximize2 size={14} strokeWidth={2.2} />
                )}
              </button>
              <button
                type="button"
                className="product-focusable product-control"
                aria-label="상세 패널 닫기"
                onClick={onClose}
                style={{
                  width: 28,
                  height: 28,
                  padding: 0,
                  borderRadius: 999,
                  border: "none",
                  background: inkA(0.06),
                  color: UI.ink2,
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  lineHeight: 1,
                }}
              >
                <X size={15} strokeWidth={2.2} />
              </button>
            </div>
          </div>
          {navigation}
        </div>

        <div
          ref={bodyRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overflowX: "hidden",
            overscrollBehavior: "contain",
            scrollbarGutter: "stable",
            padding: "0 20px 28px",
            ...bodyStyle,
          }}
        >
          {children}
        </div>
      </motion.aside>
    </>
  );
}
