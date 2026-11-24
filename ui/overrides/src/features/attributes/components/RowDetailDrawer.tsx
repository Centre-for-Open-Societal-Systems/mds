"use client";

import { X, Code, Copy, Check, Edit3 } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { StatusBadge } from "@/features/catalogue/components/ui";
import type { ListValue } from "@/features/catalogue/types";

interface RowDetailDrawerProps {
    open: boolean;
    value: ListValue | null;
    schemaProperties?: Record<string, any>;
    onClose: () => void;
    onEditCatalog?: () => void;
}

export default function RowDetailDrawer({
    open,
    value,
    schemaProperties,
    onClose,
    onEditCatalog,
}: RowDetailDrawerProps) {
    const t = useTranslations();
    const [rawJson, setRawJson] = useState(false);
    const [copied, setCopied] = useState(false);

    if (!open || !value) return null;

    const copyJson = () => {
        navigator.clipboard.writeText(JSON.stringify(value, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const attrs = value.attributes ?? {};
    const schemaKeys = schemaProperties ? Object.keys(schemaProperties) : [];
    const allAttrKeys = Array.from(new Set([...schemaKeys, ...Object.keys(attrs)]));

    return (
        <div className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end transition-opacity">
            <div
                className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-5 border-b border-gray-200 flex items-center justify-between bg-gray-50/80">
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-[18px] font-bold text-gray-900">{value.display || value.value_code}</h2>
                            <StatusBadge status={value.status} label={t(`cat_status_${value.status}`)} />
                        </div>
                        <p className="text-[13px] font-mono text-gray-500 mt-0.5">{value.value_code}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-full transition-colors cursor-pointer"
                        title={t("close")}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Basic details */}
                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                        <h3 className="text-[13px] font-bold uppercase tracking-wider text-gray-400">Basic Information</h3>
                        <div className="grid grid-cols-2 gap-3 text-[14px]">
                            <div>
                                <span className="text-gray-500 block text-[12px]">Code</span>
                                <span className="font-mono font-medium text-gray-900">{value.value_code}</span>
                            </div>
                            <div>
                                <span className="text-gray-500 block text-[12px]">Sort Order</span>
                                <span className="font-medium text-gray-900">{value.sort_order ?? 0}</span>
                            </div>
                            {value.parent_code ? (
                                <div className="col-span-2">
                                    <span className="text-gray-500 block text-[12px]">Parent Code</span>
                                    <span className="font-mono font-medium text-gray-900">{value.parent_code}</span>
                                </div>
                            ) : null}
                        </div>
                    </div>

                    {/* Attributes / Fields */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-[14px] font-bold text-gray-900">Custom Attributes & Fields</h3>
                            <button
                                type="button"
                                onClick={() => setRawJson(!rawJson)}
                                className="flex items-center gap-1.5 text-[12px] font-medium text-[#ED7C22] hover:text-[#d46917] cursor-pointer"
                            >
                                <Code size={14} />
                                {rawJson ? "Formatted View" : "Raw JSON"}
                            </button>
                        </div>

                        {rawJson ? (
                            <div className="relative">
                                <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl text-[12px] font-mono overflow-x-auto max-h-[360px]">
                                    {JSON.stringify(attrs, null, 2)}
                                </pre>
                                <button
                                    type="button"
                                    onClick={copyJson}
                                    className="absolute top-3 right-3 p-1.5 rounded-md bg-gray-800 text-gray-300 hover:text-white transition-colors cursor-pointer"
                                    title="Copy JSON"
                                >
                                    {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                                </button>
                            </div>
                        ) : allAttrKeys.length === 0 ? (
                            <p className="text-[13px] text-gray-400 italic bg-gray-50 p-4 rounded-xl text-center">
                                No additional attributes defined for this entry.
                            </p>
                        ) : (
                            <div className="border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                                {allAttrKeys.map((key) => {
                                    const schemaDef = schemaProperties?.[key];
                                    const label = schemaDef?.title || schemaDef?.description || key.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());
                                    const val = attrs[key];
                                    const displayVal = val === null || val === undefined
                                        ? "—"
                                        : typeof val === "object"
                                            ? JSON.stringify(val)
                                            : String(val);

                                    return (
                                        <div key={key} className="p-3.5 hover:bg-gray-50/50 flex flex-col gap-0.5">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[13px] font-semibold text-gray-800">{label}</span>
                                                <span className="text-[11px] font-mono text-gray-400">{key}</span>
                                            </div>
                                            <span className="text-[14px] text-gray-700 break-words mt-0.5 font-medium">
                                                {displayVal}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50/50 flex items-center justify-between">
                    <div>
                        {onEditCatalog ? (
                            <button
                                type="button"
                                onClick={() => {
                                    onClose();
                                    onEditCatalog();
                                }}
                                className="inline-flex items-center gap-2 px-4 py-2 text-[14px] font-semibold text-black bg-[#f4bb1b] hover:bg-[#e5ad10] rounded-lg transition-colors cursor-pointer shadow-xs"
                            >
                                <Edit3 size={16} />
                                <span>{t("cat_open_draft") || "Edit catalog"}</span>
                            </button>
                        ) : null}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-[14px] font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                        {t("close")}
                    </button>
                </div>
            </div>
        </div>
    );
}

