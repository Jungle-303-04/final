import { Button } from "./primitives/Button";
import { StableTextSlot } from "./primitives/StableTextSlot";
import type { ThemeName } from "./useTheme";

export function ThemeToggle({ onToggle, theme }: { onToggle: () => void; theme: ThemeName }) {
  return (
    <Button aria-label="화면 테마 전환" className="theme-toggle" data-stable-control="theme-toggle" onClick={onToggle} wide>
      <StableTextSlot wide>{theme === "dark" ? "라이트 모드" : "다크 모드"}</StableTextSlot>
    </Button>
  );
}
