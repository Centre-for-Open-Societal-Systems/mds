"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import { toast } from "react-toastify";
import { useRbac } from "@/context/RbacContext";
import { errorMessage, useCatalogueApi, useCatalogueQuery } from "@/features/catalogue/api";
import { useCatalogueConfig } from "@/features/catalogue/hooks";
import VersionBar, { GEO_DRAFT_OPS, findOpenDraft } from "@/features/catalogue/components/VersionBar";
import NoteDialog, { type NoteDialogResult } from "@/features/catalogue/components/NoteDialog";
import VersionHistoryActivity from "@/features/catalogue/components/VersionHistoryActivity";
import { ErrorBox, Panel, Tabs } from "@/features/catalogue/components/ui";
import { LicenceText, VisibilityBadge } from "@/features/catalogue/components/Publication";
import type {
    GeoSettingsResponse,
    GetGeoLevelsResponse,
    GetGeoVersionsResponse,
    VersionRef,
} from "@/features/catalogue/types";
import GeoSettingsDialog from "./GeoSettingsDialog";
import GeoBoundaries from "./GeoBoundaries";
import GeoChangeEvents from "./GeoChangeEvents";
import GeoCrosswalk from "./GeoCrosswalk";
import GeoHierarchyExplorer from "./GeoHierarchyExplorer";
import GeoUnitsBrowser from "./GeoUnitsBrowser";

export const GEO_ACTIONS = {
    edit: "geo:edit",
    delete: "geo:delete",
    publish: "geo:publish",
};

/** Top-level groups; Data has sub-tabs, Lineage shows two panels side by side, History merges versions and activity, Details holds metadata & version management. */
type GroupKey = "data" | "lineage" | "history" | "details";
type DataTabKey = "hierarchy" | "units" | "boundaries";

const EMPTY = {};

/**
 * Geo Locations page: geography version selector and badge, draft lifecycle, and four groups:
 * Data (per version the hierarchy tree, a flat unit search and boundaries), Lineage (change events
 * and the crosswalk lookup side by side), History (version history, each version expanding to
 * its activity, plus the geography's full change feed) and Details (metadata & version management).
 */
export default function GeoCatalogueView() {
    const t = useTranslations();
    const call = useCatalogueApi();
    const { can } = useRbac();
    const { config } = useCatalogueConfig();
    const [group, setGroup] = useState<GroupKey>("data");
    const [dataTab, setDataTab] = useState<DataTabKey>("hierarchy");
    const [chosen, setChosen] = useState<VersionRef | null>(null);
    const [includeRetired, setIncludeRetired] = useState(false);
    const [treeNonce, setTreeNonce] = useState(0);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [openDraftDialog, setOpenDraftDialog] = useState(false);
    const settingsQuery = useCatalogueQuery<GeoSettingsResponse>("get_geo_settings", EMPTY);
    const geoSettings = settingsQuery.data?.settings ?? null;

    const versionsQuery = useCatalogueQuery<GetGeoVersionsResponse>("get_geo_versions", EMPTY);
    const versions = versionsQuery.data?.versions ?? [];
    const draft = findOpenDraft(versions);
    const hasPublished = versions.some((v) => v.status === "PUBLISHED");
    const latestPublished = versions.find((v) => v.is_latest) ?? null;

    const selected: VersionRef = chosen ?? (hasPublished || !draft ? "latest" : "draft");
    const effective: VersionRef = selected === "draft" && !draft && versionsQuery.data ? "latest" : selected;

    const levelsQuery = useCatalogueQuery<GetGeoLevelsResponse>(
        "get_geo_levels",
        versionsQuery.data && (hasPublished || draft) ? { version: effective } : null,
    );
    const shown = levelsQuery.data?.version ?? null;
    const levels = levelsQuery.data?.levels ?? [];

    const canEdit = can(GEO_ACTIONS.edit);
    const editable = effective === "draft" && draft?.status === "DRAFT" && canEdit;

    // After an edit inside a tab: refresh version metadata (who edited, unit count) only.
    const refreshMeta = () => {
        versionsQuery.reload();
        levelsQuery.reload();
    };
    // After a lifecycle action: also rebuild the tree.
    const reloadAll = (select?: VersionRef) => {
        if (select !== undefined) setChosen(select);
        refreshMeta();
        setTreeNonce((n) => n + 1);
    };

    const handleCreateDraft = async (r: NoteDialogResult) => {
        try {
            await call(GEO_DRAFT_OPS.create, {
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
        } else if (effective !== "draft") {
            setChosen("draft");
        } else {
            toast.info("Geography is already in editable draft mode.");
        }
    };

    const groups = [
        { key: "data" as const, label: t("cat_group_data") },
        { key: "lineage" as const, label: t("cat_group_lineage") },
        { key: "history" as const, label: t("cat_group_history") },
        { key: "details" as const, label: t("cat_tab_details") || t("cat_details") || "Details" },
    ];
    const boundariesEnabled = Boolean(config?.boundary_store_enabled);
    const dataTabs = [
        { key: "hierarchy" as const, label: t("cat_tab_hierarchy") },
        { key: "units" as const, label: t("cat_tab_units") },
        { key: "boundaries" as const, label: t("cat_tab_boundaries"), hidden: !boundariesEnabled },
    ];
    // Boundaries can be hidden (boundary store disabled): fall back to the hierarchy.
    const activeDataTab: DataTabKey = dataTab === "boundaries" && !boundariesEnabled ? "hierarchy" : dataTab;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
                <h1 className="font-semibold text-[24px] text-black">{t("geo_locations")}</h1>
            </div>

            {settingsOpen ? (
                <GeoSettingsDialog
                    settings={geoSettings}
                    publicCatalogueEnabled={config?.public_catalogue_enabled}
                    onClose={() => setSettingsOpen(false)}
                    onSaved={() => settingsQuery.reload()}
                />
            ) : null}

            <ErrorBox message={versionsQuery.error} />

            {/* Top version section ONLY shown for drafts. Hidden for published versions */}
            {versionsQuery.data && draft ? (
                <VersionBar
                    versions={versions}
                    selected={effective}
                    onSelect={setChosen}
                    shown={shown}
                    subject={{}}
                    ops={GEO_DRAFT_OPS}
                    editPermission={GEO_ACTIONS.edit}
                    publishPermission={GEO_ACTIONS.publish}
                    approvalMode={config?.approval_mode}
                    onChanged={reloadAll}
                />
            ) : null}

            <ErrorBox message={levelsQuery.error} />
            {versionsQuery.data && !hasPublished && !draft ? (
                <p className="rounded bg-gray-100 px-3 py-2 text-[13px] text-gray-700">{t("cat_geo_empty")}</p>
            ) : null}

            <Tabs<GroupKey> tabs={groups} active={group} onChange={setGroup} />

            {group === "data" ? (
                <div className="space-y-3">
                    <Tabs<DataTabKey> tabs={dataTabs} active={activeDataTab} onChange={setDataTab} />
                    {shown ? (
                        <>
                            {activeDataTab === "hierarchy" ? (
                                <div className="space-y-2">
                                    <div className="flex flex-wrap items-center gap-4">
                                        <label className="flex cursor-pointer items-center gap-2 text-[14px] text-gray-700">
                                            <input
                                                type="checkbox"
                                                checked={includeRetired}
                                                onChange={(e) => setIncludeRetired(e.target.checked)}
                                                className="h-4 w-4 accent-[#f4bb1b]"
                                            />
                                            {t("cat_include_retired")}
                                        </label>
                                    </div>
                                    <GeoHierarchyExplorer
                                        key={`${String(effective)}-${includeRetired}-${treeNonce}`}
                                        version={effective}
                                        editable={editable}
                                        includeRetired={includeRetired}
                                        embedded
                                        onChanged={refreshMeta}
                                        onEditCatalog={canEdit && !editable ? handleEditCatalog : undefined}
                                        onEditSettings={canEdit ? () => setSettingsOpen(true) : undefined}
                                    />
                                </div>
                            ) : null}

                            {activeDataTab === "units" ? (
                                <Panel>
                                    <GeoUnitsBrowser
                                        version={effective}
                                        levels={levels}
                                        editable={editable}
                                        onChanged={refreshMeta}
                                        onEditCatalog={canEdit && !editable ? handleEditCatalog : undefined}
                                        onEditSettings={canEdit ? () => setSettingsOpen(true) : undefined}
                                    />
                                </Panel>
                            ) : null}

                            {activeDataTab === "boundaries" ? (
                                <Panel>
                                    <GeoBoundaries shown={shown} levels={levels} editable={editable} onChanged={refreshMeta} />
                                </Panel>
                            ) : null}
                        </>
                    ) : null}
                </div>
            ) : null}

            {group === "lineage" ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {shown ? (
                        <Panel className="min-w-0 space-y-3">
                            <h2 className="text-[17px] font-semibold text-black">{t("cat_tab_changes")}</h2>
                            <GeoChangeEvents shown={shown} versions={versions} editable={editable} onChanged={refreshMeta} />
                        </Panel>
                    ) : null}
                    <Panel className="min-w-0 space-y-3">
                        <h2 className="text-[17px] font-semibold text-black">{t("cat_tab_crosswalk")}</h2>
                        <GeoCrosswalk versions={versions} />
                    </Panel>
                </div>
            ) : null}

            {group === "history" ? (
                <VersionHistoryActivity
                    subjectType="geo"
                    versions={versions}
                    extraHeader={t("cat_units")}
                    extraCell={(v) => (v.unit_count != null ? String(v.unit_count) : "—")}
                    onView={(ref) => {
                        setChosen(ref);
                        setGroup("data");
                        setDataTab("hierarchy");
                    }}
                />
            ) : null}

            {/* Details Tab: Geography Metadata & Version Management */}
            {group === "details" ? (
                <Panel>
                    <div className="space-y-6">
                        {/* Geography Details & Metadata Section */}
                        <div>
                            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-100 pb-3 mb-4">
                                <div>
                                    <h2 className="text-[18px] font-semibold text-black">{t("geo_locations")}</h2>
                                    {shown?.unit_count != null ? (
                                        <p className="text-[13px] text-gray-500 mt-0.5">
                                            {t("cat_units_total", { total: shown.unit_count })}
                                        </p>
                                    ) : null}
                                </div>
                                <div className="flex items-center gap-3">
                                    <VisibilityBadge visibility={geoSettings?.visibility} />
                                    {canEdit ? (
                                        <button
                                            type="button"
                                            onClick={() => setSettingsOpen(true)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 text-[13px] font-medium transition-colors cursor-pointer"
                                            title={t("cat_geo_settings") || "Publication settings"}
                                        >
                                            <Settings size={15} />
                                            <span>{t("cat_geo_settings") || "Publication settings"}</span>
                                        </button>
                                    ) : null}
                                </div>
                            </div>

                            {/* Metadata Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="p-3.5 bg-gray-50/50 rounded-lg border border-gray-200">
                                    <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                                        {t("cat_country") || "Country"}
                                    </div>
                                    <div className="text-[14px] font-medium text-gray-900 mt-1">
                                        {shown?.country || "—"}
                                    </div>
                                </div>

                                <div className="p-3.5 bg-gray-50/50 rounded-lg border border-gray-200">
                                    <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                                        {t("cat_owner_org") || "Publisher"}
                                    </div>
                                    <div className="text-[14px] font-medium text-gray-900 mt-1">
                                        {shown?.owner_org || "—"}
                                    </div>
                                </div>

                                <div className="p-3.5 bg-gray-50/50 rounded-lg border border-gray-200">
                                    <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider">
                                        Licence
                                    </div>
                                    <div className="text-[14px] font-medium text-gray-900 mt-1">
                                        {geoSettings?.licence_label || geoSettings?.licence_uri ? (
                                            <LicenceText uri={geoSettings?.licence_uri} label={geoSettings?.licence_label} />
                                        ) : (
                                            "—"
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Version Management Section */}
                        <div className="pt-6 border-t border-gray-200">
                            <div className="mb-4">
                                <h3 className="text-[16px] font-semibold text-black">Version Management</h3>
                                <p className="text-[13px] text-gray-500">
                                    Manage versions, review drafts, and inspect lifecycle status.
                                </p>
                            </div>

                            {versionsQuery.data ? (
                                <VersionBar
                                    versions={versions}
                                    selected={effective}
                                    onSelect={setChosen}
                                    shown={shown}
                                    subject={{}}
                                    ops={GEO_DRAFT_OPS}
                                    editPermission={GEO_ACTIONS.edit}
                                    publishPermission={GEO_ACTIONS.publish}
                                    approvalMode={config?.approval_mode}
                                    onChanged={reloadAll}
                                />
                            ) : null}

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
                                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                                    <div className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                                        Current Viewing Version
                                    </div>
                                    <div className="text-[16px] font-bold text-gray-800">
                                        {effective === "draft"
                                            ? `Draft v${draft?.version_no ?? ""}`
                                            : shown
                                              ? `v${shown.version_no} (${shown.status})`
                                              : String(effective)}
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
                    </div>
                </Panel>
            ) : null}

            {openDraftDialog ? (
                <NoteDialog
                    open
                    title={t("cat_open_draft")}
                    message={t(latestPublished?.version_no ? "cat_open_draft_hint" : "cat_open_draft_hint_first", {
                        no: latestPublished?.version_no ?? 1,
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

