"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { ArrowLeft, Sparkles, CheckCircle, Clock } from "lucide-react";
import { toast } from "react-toastify";
import Button from "@/components/Button";
import TableSkeleton from "@/components/TableSkeleton";
import Can from "@/components/Can";
import EditButton from "@/components/EditButton";
import { useRbac } from "@/context/RbacContext";
import { errorMessage, useCatalogueApi, useCatalogueQuery } from "@/features/catalogue/api";
import { useCatalogueConfig } from "@/features/catalogue/hooks";
import AttributeSchemaEditor from "@/features/catalogue/components/AttributeSchemaEditor";
import ListDiffView from "@/features/catalogue/components/ListDiffView";
import VersionBar, { LIST_DRAFT_OPS, findOpenDraft } from "@/features/catalogue/components/VersionBar";
import NoteDialog, { type NoteDialogResult } from "@/features/catalogue/components/NoteDialog";
import VersionHistoryActivity from "@/features/catalogue/components/VersionHistoryActivity";
import { ErrorBox, Panel, Tabs, localizedLabel } from "@/features/catalogue/components/ui";
import { LicenceText, VisibilityBadge } from "@/features/catalogue/components/Publication";
import { themeKey, themeLabel } from "@/features/catalogue/theme";
import type { GetListResponse, GetListVersionsResponse, JsonSchema, VersionRef } from "@/features/catalogue/types";
import { useCatalogueLists } from "../hooks";
import AttributeDialog from "./AttributeDialog";
import AttributeValuesView from "./AttributeValuesView";
import { REFERENCE_DATA_ACTIONS } from "./AttributeListExplorer";

interface AttributeDetailProps {
    attributeId: string;
}

type TabKey = "values" | "schema" | "history" | "diff" | "version";

/**
 * One catalog: version selector and badge, draft lifecycle, values (edited in the draft),
 * attribute schema, history (version history, each version expanding to its activity, plus the
 * list's full change feed), diff between versions, and dedicated Version tab.
 */
export default function AttributeDetail({ attributeId }: AttributeDetailProps) {
    const t = useTranslations();
    const locale = useLocale();
    const router = useRouter();
    const call = useCatalogueApi();
    const { can } = useRbac();
    const { config } = useCatalogueConfig();
    const { allLists } = useCatalogueLists();

    const [tab, setTab] = useState<TabKey>("values");
    const [chosen, setChosen] = useState<VersionRef | null>(null);
    const [editOpen, setEditOpen] = useState(false);
    const [valuesNonce, setValuesNonce] = useState(0);
    const [openDraftDialog, setOpenDraftDialog] = useState(false);

    const versionsQuery = useCatalogueQuery<GetListVersionsResponse>("get_list_versions", { list_code: attributeId });
    const versions = versionsQuery.data?.versions ?? [];
    const draft = findOpenDraft(versions);
    const hasPublished = versions.some((v) => v.status === "PUBLISHED" && v.is_latest);

    // Default: the version in effect, or the open draft for a list that was never published.
    const selected: VersionRef = chosen ?? (hasPublished || !draft ? "latest" : "draft");
    const effectiveSelected: VersionRef = selected === "draft" && !draft && versionsQuery.data ? "latest" : selected;

    const listQuery = useCatalogueQuery<GetListResponse>(
        "get_list",
        versionsQuery.data
            ? effectiveSelected === "latest" && !hasPublished
                ? { list_code: attributeId } // never published: metadata only
                : { list_code: attributeId, version: effectiveSelected }
            : null,
    );
    const list = listQuery.data?.list;
    const shown = listQuery.data?.version ?? null;

    const canEdit = can(REFERENCE_DATA_ACTIONS.edit);
    const editable = effectiveSelected === "draft" && draft?.status === "DRAFT" && canEdit;

    const reloadAll = (select?: VersionRef) => {
        if (select !== undefined) setChosen(select);
        versionsQuery.reload();
        listQuery.reload();
        setValuesNonce((n) => n + 1);
    };

    const handleCreateDraft = async (r: NoteDialogResult) => {
        try {
            await call(LIST_DRAFT_OPS.create, {
                list_code: attributeId,
                change_note: r.note,
                effective_from: r.effective_from,
            });
            toast.success(t("cat_draft_opened"));
            setOpenDraftDialog(false);
            reloadAll("draft");
        } catch (e) {
            toast.error(errorMessage(e));
        }
    };

    const handleEditCatalog = () => {
        if (!draft) {
            setOpenDraftDialog(true);
        } else if (effectiveSelected !== "draft") {
            setChosen("draft");
        } else {
            toast.info("Catalog is already in editable draft mode.");
        }
    };

    const backBar = (title?: string) => {
        const isLookup = list?.table_type === "lookup";
        const backUrl = isLookup ? "/datasets?type=lookup" : "/datasets?type=catalog";
        const backLabel = isLookup ? "All Lookups" : "All Catalogs";
        return (
            <div className="flex items-center gap-2 mb-4">
                <button
                    type="button"
                    onClick={() => router.push(backUrl)}
                    className="flex items-center gap-2 text-[18px] font-semibold text-black/80 hover:text-black transition-colors cursor-pointer"
                >
                    <ArrowLeft size={18} />
                    {backLabel}
                </button>
                <span className="text-[22px] text-black">&gt;</span>
                {title ? (
                    <h1 className="font-semibold text-[18px] text-black">{title}</h1>
                ) : (
                    <div className="h-6 bg-gray-200 rounded animate-pulse w-1/4"></div>
                )}
            </div>
        );
    };

    if (versionsQuery.error && !versionsQuery.data) {
        return (
            <div>
                {backBar(attributeId)}
                <ErrorBox message={versionsQuery.error} />
            </div>
        );
    }

    if (!list) {
        return (
            <div>
                {backBar()}
                {listQuery.error ? <ErrorBox message={listQuery.error} /> : <TableSkeleton rows={10} columns={4} />}
            </div>
        );
    }

    const title = localizedLabel(list.display, list.display_i18n, locale) || list.list_code || list.list_id;
    const listCode = list.list_code || list.list_id;

    return (
        <div className="space-y-4">
            {backBar(title)}

            {/* Header row with catalog details and action buttons */}
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1 text-[14px] text-gray-600">
                    <div>
                        <span className="font-mono text-gray-800">{listCode}</span>
                        {list.owner_org ? (
                            <span>
                                {" · "}
                                {t("cat_owner_org")}: <span className="text-gray-800">{list.owner_org}</span>
                            </span>
                        ) : null}
                        <span>
                            {" · "}
                            {t("cat_theme")}: <span className="text-gray-800">{themeLabel(themeKey(list), t)}</span>
                        </span>
                        {list.is_hierarchical ? <span>{` · ${t("is_hierarchical")}`}</span> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <VisibilityBadge visibility={list.visibility} />
                        <LicenceText uri={list.licence_uri} label={list.licence_label} />
                    </div>
                    {list.description ? <p className="max-w-3xl">{list.description}</p> : null}
                    {list.display_i18n && Object.keys(list.display_i18n).length ? (
                        <p className="text-[13px]">
                            {Object.entries(list.display_i18n)
                                .map(([l, v]) => `${l}: ${v}`)
                                .join(" · ")}
                        </p>
                    ) : null}
                </div>

                {/* Requirement 12: Add Edit catalog button after catalog settings button in the same row */}
                <div className="flex items-center gap-3">
                    <Can action={REFERENCE_DATA_ACTIONS.edit}>
                        <EditButton onClick={() => setEditOpen(true)}>{t("cat_edit_list")}</EditButton>
                    </Can>
                    {canEdit ? (
                        !draft ? (
                            <Button
                                variant="warning"
                                onClick={() => setOpenDraftDialog(true)}
                                className="!bg-[#f4bb1b] !text-black font-semibold hover:!bg-[#e5ad10]"
                            >
                                {t("cat_open_draft")}
                            </Button>
                        ) : effectiveSelected !== "draft" ? (
                            <Button
                                variant="warning"
                                onClick={() => setChosen("draft")}
                                className="!bg-[#f4bb1b] !text-black font-semibold hover:!bg-[#e5ad10]"
                            >
                                {t("cat_open_draft")}
                            </Button>
                        ) : null
                    ) : null}
                </div>
            </div>

            {/* Requirement 11 & 13: Top version section ONLY shown for drafts. Hidden for published versions */}
            {draft ? (
                <VersionBar
                    versions={versions}
                    selected={effectiveSelected}
                    onSelect={setChosen}
                    shown={shown}
                    subject={{ list_code: list.list_id }}
                    ops={LIST_DRAFT_OPS}
                    editPermission={REFERENCE_DATA_ACTIONS.edit}
                    publishPermission={REFERENCE_DATA_ACTIONS.publish}
                    approvalMode={config?.approval_mode}
                    onChanged={reloadAll}
                />
            ) : null}

            <ErrorBox message={listQuery.error} />

            {/* Requirement 11: Add Version tab after Compare versions */}
            <Tabs<TabKey>
                tabs={[
                    { key: "values", label: t("cat_tab_values") },
                    { key: "schema", label: t("cat_tab_schema") },
                    { key: "history", label: t("cat_group_history") },
                    { key: "diff", label: t("cat_tab_diff") },
                    { key: "version", label: t("cat_tab_version") || "Version" },
                ]}
                active={tab}
                onChange={setTab}
            />

            {tab === "values" ? (
                <AttributeValuesView
                    key={`${list.list_id}-${String(effectiveSelected)}-${list.is_hierarchical}`}
                    list={list}
                    version={effectiveSelected}
                    editable={editable}
                    hasDraft={Boolean(draft)}
                    reloadNonce={valuesNonce}
                    onChanged={() => versionsQuery.reload()}
                    onEditCatalog={canEdit ? handleEditCatalog : undefined}
                />
            ) : null}

            {tab === "schema" ? (
                <Panel>
                    <AttributeSchemaEditor
                        key={`${String(effectiveSelected)}-${JSON.stringify(list.attribute_schema ?? null)}`}
                        value={list.attribute_schema}
                        knownLists={allLists.map((l) => l.list_code || l.list_id)}
                        readOnly={!editable}
                        onSave={async (schema: JsonSchema | null) => {
                            await call("update_list", { list_code: list.list_id, attribute_schema: schema });
                            toast.success(t("cat_schema_saved"));
                            reloadAll();
                        }}
                    />
                </Panel>
            ) : null}

            {tab === "history" ? (
                <VersionHistoryActivity
                    subjectType="list"
                    subjectId={list.list_id}
                    versions={versions}
                    onView={(ref) => {
                        setChosen(ref);
                        setTab("values");
                    }}
                />
            ) : null}

            {tab === "diff" ? (
                <Panel>
                    <ListDiffView listCode={list.list_id} versions={versions} />
                </Panel>
            ) : null}

            {/* Requirement 11 & 13: Version Tab showing full version section and lifecycle details */}
            {tab === "version" ? (
                <Panel>
                    <div className="space-y-6">
                        <div className="border-b border-gray-100 pb-3">
                            <h2 className="text-[18px] font-semibold text-black">{t("cat_tab_version") || "Version"}</h2>
                            <p className="text-[13px] text-gray-500">
                                View version status, manage approvals, and switch between published and draft versions.
                            </p>
                        </div>

                        <VersionBar
                            versions={versions}
                            selected={effectiveSelected}
                            onSelect={setChosen}
                            shown={shown}
                            subject={{ list_code: list.list_id }}
                            ops={LIST_DRAFT_OPS}
                            editPermission={REFERENCE_DATA_ACTIONS.edit}
                            publishPermission={REFERENCE_DATA_ACTIONS.publish}
                            approvalMode={config?.approval_mode}
                            onChanged={reloadAll}
                        />

                        {/* Additional version summary information */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                    Current Viewing Version
                                </div>
                                <div className="text-[16px] font-bold text-gray-800">
                                    {effectiveSelected === "draft"
                                        ? `Draft v${draft?.version_no ?? ""}`
                                        : shown
                                          ? `v${shown.version_no} (${shown.status})`
                                          : String(effectiveSelected)}
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                    Total Versions
                                </div>
                                <div className="text-[16px] font-bold text-gray-800">
                                    {versions.length} {versions.length === 1 ? "version" : "versions"}
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                    Draft Status
                                </div>
                                <div className="text-[16px] font-bold text-gray-800">
                                    {draft ? `Active (${draft.status})` : "No active draft"}
                                </div>
                            </div>
                        </div>
                    </div>
                </Panel>
            ) : null}

            {editOpen ? (
                <AttributeDialog
                    open
                    mode="edit"
                    attribute={list}
                    onClose={() => setEditOpen(false)}
                    onSuccess={(result) => reloadAll(result.draft && !draft ? "draft" : undefined)}
                />
            ) : null}

            {openDraftDialog ? (
                <NoteDialog
                    open
                    title={t("cat_open_draft")}
                    message={t(list.latest_published_version_no ? "cat_open_draft_hint" : "cat_open_draft_hint_first", {
                        no: list.latest_published_version_no ?? 1,
                    })}
                    noteLabel={t("cat_change_note")}
                    showEffectiveFrom
                    confirmLabel={t("cat_open_draft")}
                    confirmVariant="primary"
                    onConfirm={handleCreateDraft}
                    onClose={() => setOpenDraftDialog(false)}
                />
            ) : null}
        </div>
    );
}

