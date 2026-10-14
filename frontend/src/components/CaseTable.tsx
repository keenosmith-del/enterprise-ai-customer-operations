import { Link } from "react-router-dom";
import type { CustomerCase } from "../api/types";
import { Badge, date } from "./ui";
export function CaseTable({ items }: { items: CustomerCase[] }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Customer & request</th>
            <th>Category / team</th>
            <th>Priority</th>
            <th>Status</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <Link className="case-link" to={`/cases/${item.id}`}>
                  {item.subject}
                </Link>
                <div className="muted small">
                  {item.customerName}
                  {item.synthetic && <span className="sample">Synthetic</span>}
                </div>
              </td>
              <td>
                {item.category || "Awaiting triage"}
                <div className="muted small">{item.team || "Unassigned"}</div>
              </td>
              <td>{item.priority ? <Badge>{item.priority}</Badge> : "—"}</td>
              <td>
                <Badge>{item.status}</Badge>
              </td>
              <td className="muted small">{date(item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
