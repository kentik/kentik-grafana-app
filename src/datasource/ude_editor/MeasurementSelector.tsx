import React, { useEffect, useMemo, useRef, useState } from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2 } from '@grafana/data';
import { Icon, Input, Spinner, useStyles2 } from '@grafana/ui';
import { MeasurementDetail, MeasurementFamily } from '../dictionary_service';

interface Props {
  measurements: MeasurementDetail[];
  value: string;
  onChange: (measurement: string) => void;
  isLoading: boolean;
}

const FAMILY_LABELS: Record<number, string> = {
  [MeasurementFamily.TRAFFIC]: 'Traffic',
  [MeasurementFamily.NMS]: 'NMS',
  [MeasurementFamily.NMS_INTERFACES]: 'NMS Interfaces',
  [MeasurementFamily.SYNTHETICS]: 'Synthetics',
  [MeasurementFamily.BGP]: 'BGP',
  [MeasurementFamily.EVENTS]: 'Events',
  [MeasurementFamily.UNSPECIFIED]: 'Other',
};

const FAMILY_ORDER = [
  MeasurementFamily.TRAFFIC,
  MeasurementFamily.NMS,
  MeasurementFamily.NMS_INTERFACES,
  MeasurementFamily.SYNTHETICS,
  MeasurementFamily.BGP,
  MeasurementFamily.EVENTS,
  MeasurementFamily.UNSPECIFIED,
];

interface FamilyGroup {
  family: number;
  label: string;
  items: MeasurementDetail[];
}

/** A flattened, keyboard-navigable row: either a family header or an option. */
type NavRow =
  | { kind: 'header'; family: number; label: string; count: number; collapsed: boolean }
  | { kind: 'option'; family: number; name: string; label: string; title: string; selected: boolean };

function familyLabel(family: number): string {
  return FAMILY_LABELS[family] ?? 'Other';
}

/** Group measurements by family, in the canonical family order. */
function groupByFamily(measurements: MeasurementDetail[]): FamilyGroup[] {
  const grouped = new Map<number, MeasurementDetail[]>();
  for (const m of measurements) {
    const family = m.family || MeasurementFamily.UNSPECIFIED;
    if (!grouped.has(family)) {
      grouped.set(family, []);
    }
    grouped.get(family)!.push(m);
  }

  const groups: FamilyGroup[] = [];
  for (const family of FAMILY_ORDER) {
    const items = grouped.get(family);
    if (items && items.length > 0) {
      groups.push({
        family,
        label: familyLabel(family),
        items: items.sort((a, b) => (a.display_name || a.name).localeCompare(b.display_name || b.name)),
      });
    }
  }
  return groups;
}

/**
 * MeasurementSelector renders the (long) list of UDE measurements grouped by
 * family (Traffic, NMS, Synthetics, …), mirroring the Kentik UDE catalog. Each
 * family is a collapsible section so users can hide the families they don't
 * care about. A search box filters across all families and auto-expands the
 * sections that contain matches.
 */
export const MeasurementSelector: React.FC<Props> = ({ measurements, value, onChange, isLoading }) => {
  const styles = useStyles2(getStyles);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [rawActiveIndex, setActiveIndex] = useState(0);

  const groups = useMemo(() => groupByFamily(measurements), [measurements]);

  const selected = useMemo(
    () => measurements.find((m) => m.name === value),
    [measurements, value]
  );

  const filteredGroups = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return groups;
    }
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (m) =>
            (m.display_name || '').toLowerCase().includes(term) ||
            m.name.toLowerCase().includes(term)
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, search]);

  const isSearching = search.trim().length > 0;

  // Flatten the visible groups into a single keyboard-navigable list. While
  // searching, families are always expanded so all matches are reachable.
  const navRows = useMemo<NavRow[]>(() => {
    const rows: NavRow[] = [];
    for (const group of filteredGroups) {
      const isCollapsed = !isSearching && collapsed.has(group.family);
      rows.push({
        kind: 'header',
        family: group.family,
        label: group.label,
        count: group.items.length,
        collapsed: isCollapsed,
      });
      if (!isCollapsed) {
        for (const m of group.items) {
          rows.push({
            kind: 'option',
            family: group.family,
            name: m.name,
            label: m.display_name || m.name,
            title: m.description || m.name,
            selected: m.name === value,
          });
        }
      }
    }
    return rows;
  }, [filteredGroups, isSearching, collapsed, value]);

  // Clamp the active index to the current rows without storing derived state.
  const activeIndex = navRows.length === 0 ? 0 : Math.min(rawActiveIndex, navRows.length - 1);

  // Scroll the active row into view as the user navigates.
  useEffect(() => {
    if (!isOpen || !listRef.current) {
      return;
    }
    const el = listRef.current.querySelector<HTMLElement>(`[data-nav-index="${activeIndex}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, isOpen, navRows]);

  const close = () => {
    setIsOpen(false);
    setSearch('');
  };

  const open = () => {
    setActiveIndex(0);
    setIsOpen(true);
  };

  // Close on outside click.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [isOpen]);

  const toggleOpen = () => {
    if (isOpen) {
      close();
    } else {
      open();
    }
  };

  const toggleFamily = (family: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(family)) {
        next.delete(family);
      } else {
        next.add(family);
      }
      return next;
    });
  };

  const setFamilyCollapsed = (family: number, value: boolean) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (value) {
        next.add(family);
      } else {
        next.delete(family);
      }
      return next;
    });
  };

  const select = (name: string) => {
    onChange(name);
    close();
  };

  // Move the active index to the next/previous selectable row.
  const moveActive = (delta: number) => {
    setActiveIndex((idx) => {
      if (navRows.length === 0) {
        return 0;
      }
      let next = idx + delta;
      if (next < 0) {
        next = navRows.length - 1;
      } else if (next >= navRows.length) {
        next = 0;
      }
      return next;
    });
  };

  const activateRow = (row: NavRow) => {
    if (row.kind === 'header') {
      toggleFamily(row.family);
    } else {
      select(row.name);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        e.preventDefault();
        setActiveIndex(Math.max(0, navRows.length - 1));
        break;
      case 'ArrowRight': {
        const row = navRows[activeIndex];
        if (row?.kind === 'header' && row.collapsed) {
          e.preventDefault();
          setFamilyCollapsed(row.family, false);
        }
        break;
      }
      case 'ArrowLeft': {
        const row = navRows[activeIndex];
        if (row?.kind === 'header' && !row.collapsed) {
          e.preventDefault();
          setFamilyCollapsed(row.family, true);
        }
        break;
      }
      case 'Enter': {
        const row = navRows[activeIndex];
        if (row) {
          e.preventDefault();
          activateRow(row);
        }
        break;
      }
      case 'Escape':
        e.preventDefault();
        close();
        break;
      default:
        break;
    }
  };

  const triggerLabel = selected ? selected.display_name || selected.name : 'Select measurement...';

  return (
    <div className={styles.container} ref={containerRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={toggleOpen}
        disabled={isLoading}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={selected ? styles.triggerValue : styles.triggerPlaceholder}>{triggerLabel}</span>
        {isLoading ? <Spinner size="sm" /> : <Icon name={isOpen ? 'angle-up' : 'angle-down'} />}
      </button>

      {isOpen && (
        <div className={styles.panel}>
          <div className={styles.searchRow}>
            <Input
              autoFocus
              prefix={<Icon name="search" />}
              placeholder="Search measurements..."
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              onKeyDown={onKeyDown}
            />
          </div>

          <div className={styles.list} role="listbox" ref={listRef}>
            {navRows.length === 0 && <div className={styles.empty}>No measurements found</div>}

            {navRows.map((row, index) => {
              const isActive = index === activeIndex;
              if (row.kind === 'header') {
                return (
                  <button
                    type="button"
                    key={`header-${row.family}`}
                    className={isActive ? styles.familyHeaderActive : styles.familyHeader}
                    onClick={() => toggleFamily(row.family)}
                    onMouseEnter={() => setActiveIndex(index)}
                    aria-expanded={!row.collapsed}
                    data-nav-index={index}
                  >
                    <Icon name={row.collapsed ? 'angle-right' : 'angle-down'} />
                    <span className={styles.familyLabel}>{row.label}</span>
                    <span className={styles.familyCount}>{row.count}</span>
                  </button>
                );
              }
              const cls = row.selected
                ? styles.optionSelected
                : isActive
                  ? styles.optionActive
                  : styles.option;
              return (
                <button
                  type="button"
                  key={`option-${row.name}`}
                  className={cls}
                  onClick={() => select(row.name)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  aria-selected={row.selected}
                  title={row.title}
                  data-nav-index={index}
                >
                  {row.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

const getStyles = (theme: GrafanaTheme2) => ({
  container: css({
    position: 'relative',
    minWidth: 320,
  }),
  trigger: css({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(1),
    width: '100%',
    height: theme.spacing(4),
    padding: theme.spacing(0, 1),
    background: theme.components.input.background,
    border: `1px solid ${theme.components.input.borderColor}`,
    borderRadius: theme.shape.radius.default,
    color: theme.colors.text.primary,
    cursor: 'pointer',
    textAlign: 'left',
    '&:hover': {
      borderColor: theme.colors.border.medium,
    },
    '&:disabled': {
      cursor: 'not-allowed',
      opacity: 0.6,
    },
  }),
  triggerValue: css({
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  triggerPlaceholder: css({
    color: theme.colors.text.secondary,
  }),
  panel: css({
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: theme.zIndex.dropdown,
    marginTop: theme.spacing(0.5),
    background: theme.colors.background.primary,
    border: `1px solid ${theme.colors.border.weak}`,
    borderRadius: theme.shape.radius.default,
    boxShadow: theme.shadows.z3,
    overflow: 'hidden',
  }),
  searchRow: css({
    padding: theme.spacing(1),
    borderBottom: `1px solid ${theme.colors.border.weak}`,
  }),
  list: css({
    maxHeight: 320,
    overflowY: 'auto',
    padding: theme.spacing(0.5, 0),
  }),
  empty: css({
    padding: theme.spacing(1.5),
    color: theme.colors.text.secondary,
    textAlign: 'center',
  }),
  familyHeader: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    width: '100%',
    padding: theme.spacing(0.75, 1),
    background: theme.colors.background.secondary,
    border: 'none',
    color: theme.colors.text.primary,
    cursor: 'pointer',
    fontWeight: theme.typography.fontWeightMedium,
    '&:hover': {
      background: theme.colors.action.hover,
    },
  }),
  familyHeaderActive: css({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    width: '100%',
    padding: theme.spacing(0.75, 1),
    background: theme.colors.action.hover,
    border: 'none',
    color: theme.colors.text.primary,
    cursor: 'pointer',
    fontWeight: theme.typography.fontWeightMedium,
  }),
  familyLabel: css({
    flex: 1,
    textAlign: 'left',
  }),
  familyCount: css({
    color: theme.colors.text.secondary,
    fontSize: theme.typography.bodySmall.fontSize,
  }),
  option: css({
    display: 'block',
    width: '100%',
    padding: theme.spacing(0.5, 1, 0.5, 4),
    background: 'none',
    border: 'none',
    color: theme.colors.text.primary,
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    '&:hover': {
      background: theme.colors.action.hover,
    },
  }),
  optionActive: css({
    display: 'block',
    width: '100%',
    padding: theme.spacing(0.5, 1, 0.5, 4),
    background: theme.colors.action.hover,
    border: 'none',
    color: theme.colors.text.primary,
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }),
  optionSelected: css({
    display: 'block',
    width: '100%',
    padding: theme.spacing(0.5, 1, 0.5, 4),
    background: theme.colors.action.selected,
    border: 'none',
    color: theme.colors.text.primary,
    cursor: 'pointer',
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontWeight: theme.typography.fontWeightMedium,
  }),
});

