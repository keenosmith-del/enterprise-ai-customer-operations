import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, SlidersHorizontal } from "lucide-react";
import { useResource } from "../hooks/useResource";
import { categories, priorities, type CustomerCase } from "../api/types";
import { Header, State, Modal, AddButton } from "../components/ui";
import { CaseForm } from "../components/CaseForm";
import { CaseTable } from "../components/CaseTable";
export function Cases() {
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState(""),
    [category, setCategory] = useState(""),
    [priority, setPriority] = useState(""),
    [sort, setSort] = useState("newest"),
    [page, setPage] = useState(1),
    [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const query = new URLSearchParams({
    search,
    sort,
    page: String(page),
    ...(status ? { status } : {}),
    ...(category ? { category } : {}),
    ...(priority ? { priority } : {}),
  });
  const { data, error, loading, refresh } = useResource<{
    items: CustomerCase[];
    total: number;
    pageSize: number;
  }>(`/cases?${query}`, 4000);
  return (
    <>
      <Header
        eyebrow="WORKSPACE / CASES"
        title="Every request, in context."
        description="Triage, review and resolve customer requests in one place."
      >
        <AddButton onClick={() => setCreating(true)}>New case</AddButton>
      </Header>
      <div className="filters">
        <div className="search-input">
          <Search size={17} />
          <input
            aria-label="Search cases"
            placeholder="Search customers or requests"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <SlidersHorizontal size={16} />
        {[
          [
            "Status",
            status,
            setStatus,
            [
              "New",
              "Processing",
              "Review",
              "Processed",
              "Approved",
              "Resolved",
              "Failed",
            ],
          ],
          ["Category", category, setCategory, categories],
          ["Priority", priority, setPriority, priorities],
        ].map(([label, value, setter, values]) => (
          <select
            key={String(label)}
            aria-label={String(label)}
            value={value as string}
            onChange={(e) => {
              (setter as (s: string) => void)(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All {String(label).toLowerCase()}</option>
            {(values as string[]).map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        ))}
        <select
          aria-label="Sort cases"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="updated">Recently updated</option>
        </select>
      </div>
      <State loading={loading} error={error} onRetry={refresh} />
      {data && (
        <section className="panel">
          <div className="section-title">
            <h2>Case queue</h2>
            <span className="muted small">{data.total} requests</span>
          </div>
          <CaseTable items={data.items} />
          <State empty={!data.items.length} />
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {page} of{" "}
              {Math.max(1, Math.ceil(data.total / data.pageSize))}
            </span>
            <button
              disabled={page * data.pageSize >= data.total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
      {creating && (
        <Modal title="New customer case" onClose={() => setCreating(false)}>
          <CaseForm onCreated={(item) => navigate(`/cases/${item.id}`)} />
        </Modal>
      )}
    </>
  );
}
