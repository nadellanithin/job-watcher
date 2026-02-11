import { useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "./Icon.jsx";

function valueKey(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

export default function SelectMenu({
  value,
  onChange,
  options = [],
  ariaLabel,
  className = "",
  buttonClassName = "",
  menuClassName = "",
  disabled = false,
  style,
  menuStyle,
  placeholder = "Select",
}) {
  const rootRef = useRef(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const normalizedOptions = useMemo(
    () =>
      (options || []).map((opt) => ({
        value: opt?.value,
        key: valueKey(opt?.value),
        label: opt?.label ?? valueKey(opt?.value),
        disabled: !!opt?.disabled,
      })),
    [options]
  );

  const selectedIndex = normalizedOptions.findIndex((opt) => opt.key === valueKey(value));
  const selectedOption = selectedIndex >= 0 ? normalizedOptions[selectedIndex] : null;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onEscape = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const openWithInitialIndex = () => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (rect) {
      const estimatedListHeight = Math.min(280, normalizedOptions.length * 40 + 10);
      const viewportBottomInset = 92;
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportBottomInset);
      const spaceAbove = rect.top;
      setOpenUp(spaceBelow < estimatedListHeight && spaceAbove > spaceBelow);
    } else {
      setOpenUp(false);
    }
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };

  const selectAt = (index) => {
    const opt = normalizedOptions[index];
    if (!opt || opt.disabled) return;
    onChange?.(opt.value);
    setOpen(false);
  };

  const moveActive = (direction) => {
    if (!normalizedOptions.length) return;
    let idx = activeIndex;
    for (let i = 0; i < normalizedOptions.length; i += 1) {
      idx = (idx + direction + normalizedOptions.length) % normalizedOptions.length;
      if (!normalizedOptions[idx].disabled) {
        setActiveIndex(idx);
        break;
      }
    }
  };

  const onButtonKeyDown = (e) => {
    if (disabled) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        openWithInitialIndex();
      }
      moveActive(1);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        openWithInitialIndex();
      }
      moveActive(-1);
      return;
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) {
        openWithInitialIndex();
      } else {
        selectAt(activeIndex);
      }
      return;
    }

    if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`jw-selectmenu ${className}`.trim()} style={style}>
      <button
        type="button"
        className={`jw-selectmenu-btn ${buttonClassName}`.trim()}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={() => {
          if (disabled) return;
          if (!open) {
            openWithInitialIndex();
          } else {
            setOpen(false);
          }
        }}
        onKeyDown={onButtonKeyDown}
        disabled={disabled}
      >
        <span className="jw-selectmenu-label">{selectedOption?.label || placeholder}</span>
        <Icon
          name="chevronDown"
          size={14}
          className={`jw-selectmenu-caret ${open ? "open" : ""}`}
        />
      </button>

      {open ? (
        <div
          id={listId}
          role="listbox"
          className={`jw-selectmenu-list ${openUp ? "up" : ""} ${menuClassName}`.trim()}
          style={menuStyle}
        >
          {normalizedOptions.map((opt, idx) => (
            <button
              key={opt.key || `${idx}`}
              type="button"
              role="option"
              className={`jw-selectmenu-opt ${
                opt.key === valueKey(value) ? "selected" : ""
              } ${idx === activeIndex ? "active" : ""}`.trim()}
              aria-selected={opt.key === valueKey(value)}
              disabled={opt.disabled}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => selectAt(idx)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
