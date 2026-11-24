"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Lock, Sparkles, Layers } from "lucide-react";
import Button from "@/components/Button";
import { toast } from "react-toastify";
import { errorMessage, useCatalogueApi, useCatalogueQuery } from "@/features/catalogue/api";
import I18nLabelsEditor from "@/features/catalogue/components/I18nLabelsEditor";
import TypedAttributeFields from "@/features/catalogue/components/TypedAttributeFields";
import { ErrorBox, Field, Modal, inputClass, localizedLabel } from "@/features/catalogue/components/ui";
import type {
    DraftValueInput,
    GetListValueResponse,
    ListSummary,
    ListValue,
    UpsertDraftValuesResponse,
} from "@/features/catalogue/types";

type AttributeValueDialogProps = {
    open: boolean;
    mode: "add" | "edit";
    list: ListSummary;
    /** All values of the draft (for the parent picker). */
    allValues: ListValue[];
    parentCode?: string | null;
    value?: ListValue;
    onClose: () => void;
    onSuccess?: () => void;
};

/** Codes of `code` and all its descendants (a value cannot move under itself). */
function subtree(code: string, values: ListValue[]): Set<string> {
    const out = new Set([code]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const v of values) {
            if (v.parent_code && out.has(v.parent_code) && !out.has(v.value_code)) {
                out.add(v.value_code);
                grew = true;
            }
        }
    }
    return out;
}

/**
 * Form view for catalog entry:
 * - Code is automated from Display Name in add mode
 * - Structured form view with clear sections: Primary Details, Schema Fields, Localization
 */
export default function AttributeValueDialog({
    open,
    mode,
    list,
    allValues,
    parentCode,
    value,
    onClose,
    onSuccess,
}: AttributeValueDialogProps) {
    const t = useTranslations();
    const locale = useLocale();
    const call = useCatalogueApi();

    const [code, setCode] = useState(value?.value_code ?? "");
    const [codeUserEdited, setCodeUserEdited] = useState(false);
    const [display, setDisplay] = useState(value?.display ?? "");
    const [displayI18n, setDisplayI18n] = useState<Record<string, string>>(value?.display_i18n ?? {});
    const [parent, setParent] = useState<string>((mode === "edit" ? value?.parent_code : parentCode) ?? "");
    const [sortOrder, setSortOrder] = useState(String(value?.sort_order ?? 0));
    const [attributes, setAttributes] = useState<Record<string, unknown>>(value?.attributes ?? {});

    const isCatalog = list.table_type === "catalog" ||
        (!list.table_type && (list.domain === "crop" || list.domain === "livestock" || list.domain === "seed" || list.domain === "catalog" || list.domain === "agriculture"));

    const [certificationStatus, setCertificationStatus] = useState<string>(() => {
        if (value?.attributes?.certification_status) {
            return String(value.attributes.certification_status);
        }
        return mode === "add" ? "Uncertified" : "Certified";
    });
    const [showTranslations, setShowTranslations] = useState<boolean>(
        Boolean(value?.display_i18n && Object.keys(value.display_i18n).length > 0)
    );
    const [error, setError] = useState("");
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Is this entry (same value_id) in the latest published version? Then its code is fixed.
    const publishedNo = list.latest_published_version_no ?? null;
    const published = useCatalogueQuery<GetListValueResponse>(
        "get_list_value",
        mode === "edit" && value && publishedNo != null
            ? { list_code: list.list_id, value_code: value.value_code, version: publishedNo }
            : null,
    );
    const codeLocked = published.data?.value?.value_id != null && published.data.value.value_id === value?.value_id;

    // Requirement 6: Automated code generation from display name
    const handleDisplayChange = (val: string) => {
        setDisplay(val);
        if (mode === "add" && !codeUserEdited) {
            const auto = val
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
            setCode(auto);
        }
    };

    const parentChoices = useMemo(() => {
        if (!list.is_hierarchical) return [];
        const excluded = value ? subtree(value.value_code, allValues) : new Set<string>();
        return allValues.filter((v) => v.status !== "RETIRED" && !excluded.has(v.value_code));
    }, [list.is_hierarchical, allValues, value]);

    const schemaPropsCount = Object.keys(list.attribute_schema?.properties ?? {}).length;

    const handleSubmit = async () => {
        let finalCode = code.trim();
        // If code was not entered, auto-generate from display or fallback
        if (!finalCode && display.trim()) {
            finalCode = display
                .trim()
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, "_")
                .replace(/^_+|_+$/g, "");
        }
        if (!finalCode && mode === "add") {
            const prefix = (list.list_code || list.list_id || "ENTRY")
                .toUpperCase()
                .replace(/[^A-Z0-9]+/g, "_");
            finalCode = `${prefix}_${(allValues.length + 1).toString().padStart(3, "0")}`;
        }

        if (!finalCode) {
            setError(t("value_code_required"));
            return;
        }

        setError("");
        setSaveError(null);
        setSaving(true);
        const finalAttributes: Record<string, unknown> = { ...attributes };
        if (isCatalog) {
            finalAttributes.certification_status = certificationStatus;
        }
        const item: DraftValueInput = {
            value_code: finalCode,
            display: display.trim() || finalCode,
            display_i18n: displayI18n,
            sort_order: Number(sortOrder) || 0,
            attributes: Object.keys(finalAttributes).length ? finalAttributes : null,
        };
        if (value) item.value_id = value.value_id;
        if (list.is_hierarchical) item.parent_code = parent || null;
        try {
            await call<UpsertDraftValuesResponse>("upsert_draft_values", {
                list_code: list.list_id,
                values: [item],
            });
            toast.success(mode === "add" ? t("attr_value_added_successfully") : t("attr_value_updated_successfully"));
            onSuccess?.();
            onClose();
        } catch (e) {
            const message = errorMessage(e);
            setSaveError(message);
            toast.error(message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            open={open}
            title={mode === "edit" ? t("edit_reference_data_value") : t("add_entry") || "New Entry"}
            onClose={onClose}
            maxWidth={780}
            zIndex="z-50"
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    void handleSubmit();
                }}
                className="space-y-6"
            >
                {/* Form View: Section 1 - General Information */}
                <div className="bg-gray-50/70 border border-gray-200 rounded-lg p-5 space-y-4">
                    <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
                        <Layers size={18} className="text-[#ED7C22]" />
                        <h3 className="text-[15px] font-semibold text-gray-900">General Information</h3>
                    </div>

                    {/* Display Name placed first for natural entry workflow */}
                    <Field label={t("cat_display")} required={mode === "add"}>
                        <input
                            type="text"
                            value={display}
                            onChange={(e) => handleDisplayChange(e.target.value)}
                            className={inputClass}
                            placeholder="Enter entry display name..."
                            autoFocus={mode === "add"}
                        />
                    </Field>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Automated Code */}
                        <Field
                            label={mode === "add" ? `${t("value_code")} (Auto-generated)` : t("value_code")}
                            required
                            hint={mode === "edit" ? t(codeLocked ? "cat_code_locked_hint" : "cat_recode_hint") : "Auto-generated from Display Name. Can be customized."}
                        >
                            <input
                                type="text"
                                value={code}
                                onChange={(e) => {
                                    setCode(e.target.value);
                                    setCodeUserEdited(true);
                                }}
                                readOnly={codeLocked}
                                className={`${inputClass}${codeLocked ? " bg-gray-100 text-gray-600" : ""}`}
                                placeholder={t("value_code_placeholder")}
                            />
                            {error && <p className="text-[14px] text-red-500 mt-1">{error}</p>}
                        </Field>

                        {/* Sort Order */}
                        <Field label={t("sort_order")}>
                            <input
                                type="number"
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                                className={inputClass}
                            />
                        </Field>
                    </div>

                    {/* Certification Status (Only for Catalogs, not Lookups) */}
                    {isCatalog ? (
                        <Field
                            label="Certification Status"
                            hint={mode === "add" ? "New entries default to Uncertified until verified" : "Select certification status"}
                        >
                            <select
                                value={certificationStatus}
                                onChange={(e) => setCertificationStatus(e.target.value)}
                                className={inputClass}
                            >
                                <option value="Uncertified">Uncertified</option>
                                <option value="Certified">Certified</option>
                            </select>
                        </Field>
                    ) : null}

                    {/* Hierarchical Parent if applicable */}
                    {list.is_hierarchical ? (
                        <Field label={t("cat_parent_value")}>
                            <select value={parent} onChange={(e) => setParent(e.target.value)} className={inputClass}>
                                <option value="">{t("cat_top_level")}</option>
                                {parentChoices.map((v) => (
                                    <option key={v.value_id} value={v.value_code}>
                                        {localizedLabel(v.display, v.display_i18n, locale) || v.value_code} ({v.value_code})
                                    </option>
                                ))}
                            </select>
                        </Field>
                    ) : null}
                </div>

                {/* Form View: Section 2 - Entity Attributes / Schema Form */}
                <div className="bg-gray-50/70 border border-gray-200 rounded-lg p-5 space-y-4">
                    <div className="flex items-center justify-between border-b border-gray-200 pb-2">
                        <div className="flex items-center gap-2">
                            <h3 className="text-[15px] font-semibold text-gray-900">{t("cat_attributes")}</h3>
                            {schemaPropsCount > 0 ? (
                                <span className="px-2 py-0.5 rounded-full text-[12px] font-medium bg-blue-100 text-blue-800">
                                    {schemaPropsCount} schema {schemaPropsCount === 1 ? "field" : "fields"}
                                </span>
                            ) : null}
                        </div>
                    </div>

                    <TypedAttributeFields schema={list.attribute_schema} value={attributes} onChange={setAttributes} />
                </div>

                {/* Form View: Section 3 - Localization / Translations (Collapsible) */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowTranslations(!showTranslations)}
                        className="w-full flex items-center justify-between p-3.5 bg-gray-50 hover:bg-gray-100 text-left transition-colors cursor-pointer"
                    >
                        <span className="text-[14px] font-semibold text-gray-800 flex items-center gap-2">
                            {showTranslations ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            {t("cat_display_i18n")} (Multi-language translations)
                        </span>
                        <span className="text-[12px] text-gray-500">
                            {Object.keys(displayI18n).length > 0
                                ? `${Object.keys(displayI18n).length} translated`
                                : "Optional"}
                        </span>
                    </button>

                    {showTranslations ? (
                        <div className="p-4 bg-white border-t border-gray-200">
                            <I18nLabelsEditor value={displayI18n} onChange={setDisplayI18n} />
                        </div>
                    ) : null}
                </div>

                <ErrorBox message={saveError} />

                {/* Footer Buttons */}
                <div className="flex gap-4 w-full justify-end pt-3 border-t border-gray-200">
                    <Button variant="secondary" onClick={onClose} disabled={saving}>
                        {t("cancel")}
                    </Button>
                    <Button variant="primary" type="submit" loading={saving}>
                        {saving ? t("saving") : t("save")}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

