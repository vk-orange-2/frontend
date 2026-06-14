import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { deleteConfig, fetchServiceConfigs } from "../api/client";
import type { ServiceConfigRow } from "../api/types";
import { SecretPayloadTableCell } from "../components/SecretPayloadReveal";
import { editConfigPath, versionHistoryPath } from "./configPaths";

type EnvFilterChoice = "dev" | "stage" | "prod";

const envLabels: Record<string, string> = {
  dev: "dev",
  stage: "stage",
  prod: "prod",
};

function pillModifier(env: string): string {
  if (env === "dev" || env === "stage" || env === "prod") return env;
  return "other";
}

function formatPayload(payload: unknown): string {
  if (payload === null || payload === undefined) return "";
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export function ServiceConfigsPage() {
  const { serviceName: serviceNameParam } = useParams<{
    serviceName: string;
  }>();
  const serviceName = serviceNameParam
    ? decodeURIComponent(serviceNameParam)
    : "";

  const [rows, setRows] = useState<ServiceConfigRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [envFilter, setEnvFilter] = useState<EnvFilterChoice | null>(null);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceConfigRow | null>(
    null,
  );
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const refreshConfigs = useCallback(() => {
    if (!serviceName) {
      setLoading(false);
      setRows(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchServiceConfigs(serviceName)
      .then((res) => {
        if (!cancelled) setRows(res);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Не удалось загрузить конфигурации",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [serviceName]);

  useEffect(() => {
    refreshConfigs();
  }, [refreshConfigs]);

  const allRows = useMemo(() => rows ?? [], [rows]);
  const displayRows = useMemo(
    () =>
      envFilter === null
        ? allRows
        : allRows.filter((c: ServiceConfigRow) => c.environment === envFilter),
    [allRows, envFilter],
  );

  const totalRowsForSummary = useMemo(() => {
    if (envFilter === null) return allRows.length;
    return allRows.filter((c: ServiceConfigRow) => c.environment === envFilter)
      .length;
  }, [allRows, envFilter]);

  const openDeleteModal = useCallback((config: ServiceConfigRow) => {
    setDeleteTarget(config);
    setDeleteError(null);
    setDeleteSubmitting(false);
    setDeleteModalOpen(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteModalOpen(false);
    setDeleteTarget(null);
    setDeleteError(null);
    setDeleteSubmitting(false);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget?.id || !deleteTarget.currentVersion) {
      setDeleteError("Не удалось определить конфигурацию для удаления");
      return;
    }
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await deleteConfig(deleteTarget.id!, {
        expectedVersion: deleteTarget.currentVersion,
      });
      setDeleteModalOpen(false);
      setDeleteTarget(null);
      refreshConfigs();
    } catch (e: unknown) {
      setDeleteError(
        e instanceof Error ? e.message : "Не удалось удалить конфигурацию",
      );
    } finally {
      setDeleteSubmitting(false);
    }
  }, [deleteTarget, refreshConfigs]);

  return (
    <div className="page">
      <nav className="breadcrumb">
        <Link to="/">Сервисы</Link>
        <span aria-hidden="true"> / </span>
        <span>{serviceName || "…"}</span>
      </nav>

      <header className="page-head page-head--split">
        <div>
          <h1>Свойства</h1>
        </div>
        {serviceName ? (
          <div className="page-toolbar">
            <div className="env-filter">
              <label className="env-filter-label" htmlFor="service-config-env">
                Окружение
              </label>
              <select
                id="service-config-env"
                className="env-filter-select"
                value={envFilter ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setEnvFilter(v === "" ? null : (v as EnvFilterChoice));
                }}
              >
                <option value="">Все окружения</option>
                <option value="dev">dev</option>
                <option value="stage">stage</option>
                <option value="prod">prod</option>
              </select>
            </div>
            <Link
              className="btn btn--primary"
              to={`/services/${encodeURIComponent(serviceName)}/configs/new`}
            >
              Создать свойство
            </Link>
          </div>
        ) : null}
      </header>

      {!serviceName && !loading && (
        <p className="muted">Сервис не указан в адресе страницы.</p>
      )}

      {serviceName ? (
        <>
          {loading && <p className="muted">Загрузка…</p>}
          {error && <p className="error-banner">{error}</p>}

          {!loading && !error && rows && displayRows.length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Ключ</th>
                    <th>Среда</th>
                    <th>Значение (payload)</th>
                    <th>Версия</th>
                    <th className="data-table__actions-col">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((c: ServiceConfigRow) => {
                    const rawStr = formatPayload(c.latestVersion.payload);
                    return (
                      <tr key={`${c.environment}:${c.configKey}`}>
                        <td className="mono">
                          {c.configKey}
                          {c.isSecret ? (
                            <>
                              {" "}
                              <span
                                className="badge badge--inline badge--secret"
                                title="Секрет"
                              >
                                секрет
                              </span>
                            </>
                          ) : null}
                        </td>
                        <td>
                          <span
                            className={`pill pill--${pillModifier(c.environment)}`}
                          >
                            {envLabels[c.environment] ?? c.environment}
                          </span>
                        </td>
                        <td className="mono cell-value">
                          <SecretPayloadTableCell
                            isSecret={c.isSecret}
                            fullText={rawStr}
                          />
                        </td>
                        <td className="mono">{c.currentVersion}</td>
                        <td className="data-table__actions">
                          <Link
                            className="btn btn--ghost btn--small"
                            to={versionHistoryPath(
                              serviceName,
                              c.environment,
                              c.configKey,
                            )}
                          >
                            История
                          </Link>
                          <Link
                            className="btn btn--ghost btn--small"
                            to={editConfigPath(
                              serviceName,
                              c.environment,
                              c.configKey,
                            )}
                          >
                            Изменить
                          </Link>
                          <button
                            type="button"
                            className="btn btn--danger btn--small"
                            onClick={() => openDeleteModal(c)}
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="table-foot muted">
                Показано {displayRows.length} из {totalRowsForSummary}
              </p>
            </div>
          )}

          {!loading && !error && rows && allRows.length === 0 && (
            <p className="muted">Для этого сервиса конфигураций нет.</p>
          )}

          {!loading &&
            !error &&
            rows &&
            allRows.length > 0 &&
            displayRows.length === 0 && (
              <p className="muted">Для выбранной среды конфигураций нет.</p>
            )}
        </>
      ) : null}

      {deleteModalOpen && deleteTarget ? (
        <div
          className="rollback-dialog-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeDeleteModal();
          }}
        >
          <div
            className="rollback-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-dialog-title"
          >
            <h2 id="delete-dialog-title" className="rollback-dialog__title">
              Подтверждение удаления
            </h2>
            <p className="rollback-dialog__text">
              Вы уверены, что хотите удалить конфигурацию{" "}
              <strong>{deleteTarget.configKey}</strong> (
              {envLabels[deleteTarget.environment] ?? deleteTarget.environment}
              )? Это действие нельзя отменить.
            </p>
            {deleteError ? (
              <p className="error-banner rollback-dialog__err" role="alert">
                {deleteError}
              </p>
            ) : null}
            <div className="rollback-dialog__actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={closeDeleteModal}
                disabled={deleteSubmitting}
              >
                Отмена
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={confirmDelete}
                disabled={deleteSubmitting}
              >
                {deleteSubmitting ? "Удаление…" : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
