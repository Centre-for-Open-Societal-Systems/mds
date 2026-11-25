"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Edit3, Maximize2, Settings, Upload } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "react-toastify";
import Can from "@/components/Can";
import ConfirmDialog from "@/components/ConfirmDialog";
import SearchInput from "@/components/SearchInput";
import TableSkeleton from "@/components/TableSkeleton";
import Pagination from "@/components/Pagination";
import AddButton from "@/components/AddButton";
import EditButton from "@/components/EditButton";
import DeleteButton from "@/components/DeleteButton";
import { useRbac } from "@/context/RbacContext";
import { errorMessage, useCatalogueApi } from "@/features/catalogue/api";
import { ErrorBox, StatusBadge, localizedLabel } from "@/features/catalogue/components/ui";
import type { ListSummary, ListValue, VersionRef } from "@/features/catalogue/types";
import { useListValues, valueHasChildren } from "../hooks";
import AttributeValueDialog from "./AttributeValueDialog";
import RowDetailDrawer from "./RowDetailDrawer";
import CsvImportDialog from "./CsvImportDialog";
import { REFERENCE_DATA_ACTIONS } from "./AttributeListExplorer";

interface AttributeValuesViewProps {
    list: ListSummary;
    version: VersionRef;
    /** True when the open DRAFT is shown and the user may edit it. */
    editable: boolean;
    hasDraft: boolean;
    reloadNonce?: number;
    onChanged?: () => void;
    onEditCatalog?: () => void;
    onEditSettings?: () => void;
}

const PAGE_SIZE = 10;
const th = "text-left pb-3 px-6 border-b border-gray-200 font-semibold text-[#ED7C22] text-[16px] tracking-wider";

function attributeSummary(attrs: Record<string, unknown> | null | undefined): string {
    if (!attrs) return "";
    return Object.entries(attrs)
        .map(([k, v]) => `${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
        .join(" · ");
}

interface SchemaField {
    key: string;
    title: string;
    type?: string;
}

/** Values of a list at the selected version; editing actions work on the list's draft. */
export default function AttributeValuesView({
    list,
    version,
    editable,
    hasDraft,
    reloadNonce = 0,
    onChanged,
    onEditCatalog,
    onEditSettings,
}: AttributeValuesViewProps) {
    const t = useTranslations();
    const locale = useLocale();
    const call = useCatalogueApi();
    const { can } = useRbac();

    const [parentCode, setParentCode] = useState<string | null>(null);
    const [breadcrumb, setBreadcrumb] = useState<ListValue[]>([]);
    const [searchText, setSearchText] = useState("");
    const [page, setPage] = useState(1);
    const [includeRetired, setIncludeRetired] = useState(version === "draft");
    const [localNonce, setLocalNonce] = useState(0);
    const [valueDialog, setValueDialog] = useState<{ open: boolean; mode: "add" | "edit"; value?: ListValue }>({
        open: false,
        mode: "add",
    });
    const [confirmRetire, setConfirmRetire] = useState<ListValue | null>(null);
    const [cascade, setCascade] = useState(false);
    const [busyCode, setBusyCode] = useState<string | null>(null);

    // Drawer and CSV import states
    const [drawerValue, setDrawerValue] = useState<ListValue | null>(null);
    const [importOpen, setImportOpen] = useState(false);

    const { values: allValues, version: info, loading, error } = useListValues(
        list.list_id,
        version,
        includeRetired,
        reloadNonce * 1000 + localNonce,
    );

    // Dynamic schema columns: schema properties first, then any extra attributes on records
    const schemaProps = (list.attribute_schema?.properties || {}) as Record<string, any>;
    const schemaFields: SchemaField[] = useMemo(() => {
        const declaredKeys = Object.keys(schemaProps);
        const recordKeys = new Set<string>();
        for (const v of allValues) {
            if (v.attributes && typeof v.attributes === "object") {
                for (const k of Object.keys(v.attributes)) {
                    recordKeys.add(k);
                }
            }
        }
        const combinedKeys = Array.from(new Set([...declaredKeys, ...Array.from(recordKeys)]));
        return combinedKeys.map((key) => {
            const def = schemaProps[key];
            const title = def?.title || def?.description || key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
            return {
                key,
                title,
                type: def?.type || "string",
            };
        });
    }, [schemaProps, allValues]);

    const isHierarchical = list.is_hierarchical;
    const searching = Boolean(searchText.trim());

    const rows = useMemo(() => {
        const q = searchText.trim().toLowerCase();
        return allValues.filter((v) => {
            if (q) {
                // Search across code, display, and attributes
                return (
                    v.value_code.toLowerCase().includes(q) ||
                    (v.display ?? "").toLowerCase().includes(q) ||
                    Object.values(v.display_i18n ?? {}).some((l) => l.toLowerCase().includes(q)) ||
                    Object.values(v.attributes ?? {}).some((val) => String(val).toLowerCase().includes(q))
                );
            }
            if (!isHierarchical) return true;
            return parentCode ? v.parent_code === parentCode : !v.parent_code;
        });
    }, [allValues, searchText, isHierarchical, parentCode]);

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const changed = () => {
        setLocalNonce((n) => n + 1);
        onChanged?.();
    };

    const handleDrillDown = (value: ListValue) => {
        if (!isHierarchical || searching) return;
        setParentCode(value.value_code);
        setBreadcrumb((prev) => [...prev, value]);
        setPage(1);
    };

    const handleBreadcrumbClick = (index: number) => {
        if (index < 0) {
            setParentCode(null);
            setBreadcrumb([]);
        } else {
            setParentCode(breadcrumb[index].value_code);
            setBreadcrumb(breadcrumb.slice(0, index + 1));
        }
        setSearchText("");
        setPage(1);
    };

    const proceedRetire = async () => {
        if (!confirmRetire) return;
        setBusyCode(confirmRetire.value_code);
        try {
            const { payload } = await call<{ retired: string[]; removed: string[] }>("retire_draft_values", {
                list_code: list.list_id,
                value_codes: [confirmRetire.value_code],
                cascade,
            });
            toast.success(
                t("cat_values_retired", { retired: payload.retired.length, removed: payload.removed.length }),
            );
            changed();
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusyCode(null);
            setConfirmRetire(null);
            setCascade(false);
        }
    };

    const reactivate = async (value: ListValue) => {
        setBusyCode(value.value_code);
        try {
            await call("upsert_draft_values", {
                list_code: list.list_id,
                values: [{ value_id: value.value_id, value_code: value.value_code, status: "ACTIVE" }],
            });
            toast.success(t("cat_value_reactivated"));
            changed();
        } catch (e) {
            toast.error(errorMessage(e));
        } finally {
            setBusyCode(null);
        }
    };

    const showActions = editable;
    const totalColumns = 5 + (schemaFields.length > 0 ? schemaFields.length : 1) + (showActions ? 1 : 0) + 1;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                    {isHierarchical && !searching ? (
                        <>
                            <span className="text-[14px] text-gray-400">{t("attr_hierarchical_hint")}</span>
                            <div className="flex items-center gap-1 text-[16px] text-gray-500">
                                <button
                                    type="button"
                                    onClick={() => handleBreadcrumbClick(-1)}
                                    className="hover:text-[#ED7C22] transition-colors cursor-pointer"
                                >
                                    {t("root")}
                                </button>
                                {breadcrumb.map((crumb, i) => (
                                    <span key={crumb.value_id} className="flex items-center gap-1">
                                        <ChevronRight size={14} />
                                        <button
                                            type="button"
                                            onClick={() => handleBreadcrumbClick(i)}
                                            className="hover:text-[#ED7C22] transition-colors max-w-32 truncate cursor-pointer"
                                        >
                                            {localizedLabel(crumb.display, crumb.display_i18n, locale) || crumb.value_code}
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </>
                    ) : null}
                    {info ? (
                        <span className="text-[13px] text-gray-500">
                            {t("cat_values_of_version", { count: allValues.length, no: info.version_no })}
                        </span>
                    ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    {onEditSettings && (
                        <button
                            type="button"
                            onClick={onEditSettings}
                            className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 hover:text-black transition-colors cursor-pointer shadow-2xs"
                            title={t("cat_edit_list") || "Catalog settings"}
                            aria-label={t("cat_edit_list") || "Catalog settings"}
                        >
                            <Settings size={18} />
                        </button>
                    )}
                    {onEditCatalog && (
                        <button
                            type="button"
                            onClick={onEditCatalog}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px] font-semibold text-black bg-[#f4bb1b] hover:bg-[#e5ad10] rounded-lg transition-colors cursor-pointer shadow-2xs"
                        >
                            <Edit3 size={16} />
                            <span>{t("cat_open_draft") || "Edit catalog"}</span>
                        </button>
                    )}
                    <label className="flex cursor-pointer items-center gap-2 text-[14px] text-gray-700">
                        <input
                            type="checkbox"
                            checked={includeRetired}
                            onChange={(e) => {
                                setIncludeRetired(e.target.checked);
                                setPage(1);
                            }}
                            className="h-4 w-4 accent-[#f4bb1b]"
                        />
                        {t("cat_include_retired")}
                    </label>
                    <SearchInput
                        value={searchText}
                        onChange={(v) => {
                            setSearchText(v);
                            setPage(1);
                        }}
                        placeholder={t("search_attribute_values")}
                    />
                    {editable ? (
                        <div className="flex items-center gap-2">
                            <Can action={REFERENCE_DATA_ACTIONS.edit}>
                                <AddButton onClick={() => setValueDialog({ open: true, mode: "add" })} label={t("add_attribute_value")} />
                            </Can>
                            <Can action={REFERENCE_DATA_ACTIONS.edit}>
                                <button
                                    type="button"
                                    onClick={() => setImportOpen(true)}
                                    className="inline-flex items-center gap-2 px-3 py-2 border border-[#ED7C22] text-[#ED7C22] font-semibold text-[14px] rounded-lg hover:bg-orange-50 transition-colors cursor-pointer bg-white"
                                >
                                    <Upload size={16} />
                                    <span>{t("import_csv") || "Import CSV"}</span>
                                </button>
                            </Can>
                        </div>
                    ) : null}
                </div>
            </div>

            <ErrorBox message={error} />

            {loading && allValues.length === 0 ? (
                <TableSkeleton rows={10} columns={totalColumns} />
            ) : (
                <div className="bg-white rounded-[10px] pt-2 pb-3 shadow-sm">
                    {/* Compact Top Pagination */}
                    {rows.length > PAGE_SIZE && (
                        <div className="shrink-0 px-6 pb-2 flex justify-end items-center gap-3 text-[13px] text-gray-500">
                            <span>
                                {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, rows.length)} of {rows.length}
                            </span>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={currentPage <= 1}
                                    onClick={() => setPage(currentPage - 1)}
                                    className="p-1 rounded-md border border-gray-200 hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                    aria-label="Previous page"
                                >
                                    <ChevronLeft size={15} />
                                </button>
                                <button
                                    type="button"
                                    disabled={currentPage >= Math.ceil(rows.length / PAGE_SIZE)}
                                    onClick={() => setPage(currentPage + 1)}
                                    className="p-1 rounded-md border border-gray-200 hover:bg-gray-100 text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                                    aria-label="Next page"
                                >
                                    <ChevronRight size={15} />
                                </button>
                            </div>
                        </div>
                    )}
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-full border-collapse bg-white table-auto">
                            <thead>
                                <tr>
                                    {/* 1. Small Elaborate Icon Column (First) */}
                                    <th className={th} style={{ width: "40px", paddingLeft: "16px", paddingRight: "4px" }}></th>
                                    <th className={th} style={{ width: "50px" }}>{t("col_no")}</th>
                                    <th className={th} style={{ minWidth: "100px" }}>{t("value_code")}</th>
                                    {/* Changed from 'Label' to 'Name' */}
                                    <th className={th} style={{ minWidth: "160px" }}>Name</th>

                                    {/* Dynamic Columns for Schema Properties */}
                                    {schemaFields.length > 0 ? (
                                        schemaFields.map((field) => (
                                            <th
                                                key={field.key}
                                                className={th}
                                                style={{ minWidth: "140px", maxWidth: "260px" }}
                                            >
                                                <div className="line-clamp-2 break-words whitespace-normal leading-snug">
                                                    {field.title}
                                                </div>
                                            </th>
                                        ))
                                    ) : (
                                        <th className={th} style={{ minWidth: "160px", maxWidth: "260px" }}>
                                            {t("cat_attributes")}
                                        </th>
                                    )}

                                    {/* Sort Order and Status moved to the end */}
                                    <th className={th} style={{ width: "80px" }}>{t("sort_order")}</th>
                                    <th className={th} style={{ width: "90px" }}>{t("col_status")}</th>

                                    {showActions ? (
                                        <th className={th} style={{ minWidth: "120px" }}>
                                            {t("col_actions")}
                                        </th>
                                    ) : null}
                                </tr>
                            </thead>
                            <tbody>
                                {pageRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={totalColumns} className="text-center py-10 px-4 text-gray-600">
                                            {t("no_results")}
                                        </td>
                                    </tr>
                                ) : (
                                    pageRows.map((item, idx) => {
                                        const hasChildren = isHierarchical && valueHasChildren(item.value_code, allValues);
                                        const label = localizedLabel(item.display, item.display_i18n, locale) || item.value_code;
                                        const i18nTitle = Object.entries(item.display_i18n ?? {})
                                            .map(([l, v]) => `${l}: ${v}`)
                                            .join("\n");
                                        const retired = item.status === "RETIRED";
                                        const attrs = attributeSummary(item.attributes);

                                        return (
                                            <tr
                                                key={item.value_id}
                                                className={`transition-colors duration-150 ${isHierarchical && !searching ? "cursor-pointer" : ""} ${idx % 2 === 1 ? "bg-white" : "bg-gray-50"} hover:bg-gray-100 ${retired ? "text-gray-400" : ""}`}
                                                onClick={() => handleDrillDown(item)}
                                            >
                                                {/* Elaborate Details Button (First of Row) */}
                                                <td className="py-2.5 pl-4 pr-1 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        type="button"
                                                        onClick={() => setDrawerValue(item)}
                                                        title="View full entry details"
                                                        className="p-1 rounded-md border border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-black cursor-pointer transition-colors"
                                                        aria-label="View full details"
                                                    >
                                                        <Maximize2 size={14} />
                                                    </button>
                                                </td>
                                                <td className="py-2.5 px-6 align-top text-[15px] text-gray-500">
                                                    {String((currentPage - 1) * PAGE_SIZE + idx + 1).padStart(2, "0")}
                                                </td>
                                                <td className="py-2.5 px-6 align-top font-mono text-[14px]" style={{ minWidth: "120px", maxWidth: "180px" }}>
                                                    <div className="truncate" title={item.value_code}>
                                                        {item.value_code}
                                                    </div>
                                                </td>
                                                <td className="py-2.5 px-6 align-top" style={{ minWidth: "160px", maxWidth: "240px" }}>
                                                    <div className="flex items-start gap-2">
                                                        <div
                                                            className={`text-[15px] font-medium leading-snug break-words whitespace-normal line-clamp-2 ${retired ? "line-through text-gray-400" : "text-black"}`}
                                                            title={i18nTitle ? `${item.display ?? ""}\n${i18nTitle}` : label}
                                                        >
                                                            {label}
                                                        </div>
                                                        {hasChildren && !searching ? (
                                                            <ChevronRight size={16} className="text-[#ED7C22] shrink-0 mt-0.5" />
                                                        ) : null}
                                                    </div>
                                                    {searching && item.parent_code ? (
                                                        <div className="text-[12px] text-gray-500 mt-1">
                                                            {t("cat_parent_value")}: {item.parent_code}
                                                        </div>
                                                    ) : null}
                                                </td>

                                                {/* Dynamic Field Values or Fallback Attribute Summary */}
                                                {schemaFields.length > 0 ? (
                                                    schemaFields.map((field) => {
                                                        const val = item.attributes?.[field.key];
                                                        const isCert = field.key === "certification_status";

                                                        let content;
                                                        if (isCert) {
                                                            const certStr = String(val || "").toLowerCase();
                                                            const certified = certStr.includes("cert") && !certStr.includes("uncert");
                                                            content = (
                                                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[12px] font-semibold border ${certified
                                                                    ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                                                    : "bg-amber-50 text-amber-800 border-amber-200"
                                                                    }`}>
                                                                    {certified ? "Certified" : "Uncertified"}
                                                                </span>
                                                            );
                                                        } else {
                                                            const displayVal = val === null || val === undefined
                                                                ? "—"
                                                                : typeof val === "boolean"
                                                                    ? (val ? t("yes") : t("no"))
                                                                    : typeof val === "object"
                                                                        ? JSON.stringify(val)
                                                                        : String(val);
                                                            content = (
                                                                <div
                                                                    className="line-clamp-3 break-words whitespace-normal leading-relaxed text-gray-800"
                                                                    title={displayVal !== "—" ? `${field.title}: ${displayVal}` : undefined}
                                                                >
                                                                    {displayVal}
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <td
                                                                key={field.key}
                                                                className="py-2.5 px-6 align-top text-[14px] text-gray-700"
                                                                style={{ minWidth: "140px", maxWidth: "260px" }}
                                                            >
                                                                {content}
                                                            </td>
                                                        );
                                                    })
                                                ) : (
                                                    <td className="py-2.5 px-6 align-top font-mono text-[12px] text-gray-600" style={{ minWidth: "160px", maxWidth: "280px" }}>
                                                        <div className="line-clamp-3 break-words whitespace-normal" title={attrs}>
                                                            {attrs || "—"}
                                                        </div>
                                                    </td>
                                                )}

                                                {/* Sort Order and Status moved to the end */}
                                                <td className="py-2.5 px-6 align-top text-[15px] text-gray-600">{item.sort_order ?? 0}</td>
                                                <td className="py-2.5 px-6 align-top">
                                                    <StatusBadge status={item.status} label={t(`cat_status_${item.status}`)} />
                                                </td>

                                                {showActions ? (
                                                    <td className="py-2 px-6 align-middle" onClick={(e) => e.stopPropagation()}>
                                                        <div className="flex flex-wrap items-center justify-start gap-2">
                                                            {!retired ? (
                                                                <Can action={REFERENCE_DATA_ACTIONS.edit}>
                                                                    <EditButton
                                                                        onClick={() => setValueDialog({ open: true, mode: "edit", value: item })}
                                                                        title={t("edit")}
                                                                    >
                                                                        {t("edit")}
                                                                    </EditButton>
                                                                </Can>
                                                            ) : null}
                                                            {retired ? (
                                                                <Can action={REFERENCE_DATA_ACTIONS.edit}>
                                                                    <EditButton
                                                                        onClick={() => void reactivate(item)}
                                                                        disabled={busyCode === item.value_code}
                                                                        title={t("cat_reactivate")}
                                                                    >
                                                                        {t("cat_reactivate")}
                                                                    </EditButton>
                                                                </Can>
                                                            ) : (
                                                                <Can action={REFERENCE_DATA_ACTIONS.delete}>
                                                                    <DeleteButton
                                                                        onClick={() => setConfirmRetire(item)}
                                                                        loading={busyCode === item.value_code}
                                                                        title={t("cat_retire")}
                                                                    >
                                                                        {t("cat_retire")}
                                                                    </DeleteButton>
                                                                </Can>
                                                            )}
                                                        </div>
                                                    </td>
                                                ) : null}
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {valueDialog.open ? (
                <AttributeValueDialog
                    open
                    mode={valueDialog.mode}
                    list={list}
                    allValues={allValues}
                    parentCode={parentCode}
                    value={valueDialog.value}
                    onClose={() => setValueDialog({ open: false, mode: "add" })}
                    onSuccess={changed}
                />
            ) : null}

            {/* Row Detail Drawer */}
            <RowDetailDrawer
                open={!!drawerValue}
                value={drawerValue}
                schemaProperties={schemaProps}
                onClose={() => setDrawerValue(null)}
                onEditCatalog={onEditCatalog}
            />

            {/* CSV Import Dialog */}
            <CsvImportDialog
                open={importOpen}
                list={list}
                onClose={() => setImportOpen(false)}
                onSuccess={changed}
            />

            <ConfirmDialog
                open={!!confirmRetire}
                title={t("cat_retire_value_title")}
                message={t("cat_retire_value_message", {
                    name: confirmRetire ? localizedLabel(confirmRetire.display, confirmRetire.display_i18n, locale) || confirmRetire.value_code : "",
                })}
                danger
                confirming={busyCode !== null && busyCode === confirmRetire?.value_code}
                confirmLabel={t("cat_retire")}
                confirmingLabel={t("cat_retiring")}
                onConfirm={() => void proceedRetire()}
                onClose={() => {
                    setConfirmRetire(null);
                    setCascade(false);
                }}
            >
                {confirmRetire && isHierarchical && valueHasChildren(confirmRetire.value_code, allValues) ? (
                    <label className="flex cursor-pointer items-center justify-center gap-2 text-[14px]">
                        <input
                            type="checkbox"
                            checked={cascade}
                            onChange={(e) => setCascade(e.target.checked)}
                            className="h-4 w-4 accent-[#f4bb1b]"
                        />
                        {t("cat_retire_cascade")}
                    </label>
                ) : null}
            </ConfirmDialog>
        </div>
    );
}

