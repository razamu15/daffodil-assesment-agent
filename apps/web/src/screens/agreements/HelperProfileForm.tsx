/**
 * Helper details, edited directly on the Agreements screen (Product P14): no
 * confirm card. Saves with the version Jordan edited, so a concurrent change
 * comes back as a conflict instead of being overwritten.
 */
import { useState } from "react";
import type { FormEvent } from "react";
import { ContactChannel, HouseKeyAccess, PaymentMethod } from "@helper-assistant/domain";
import type { Helper, HelperProfile } from "@helper-assistant/domain";
import { asClientError, useApp } from "../../app/AppContext";
import { navigate, routes } from "../../app/routes";
import { ErrorNote } from "../../ui/common";
import { CONTACT_CHANNEL_LABEL, HOUSE_KEY_LABEL, PAYMENT_METHOD_LABEL } from "../../ui/labels";

/** A new helper starts with every unknown fact marked unknown, never guessed. */
const NEW_HELPER_PROFILE: HelperProfile = {
  name: "",
  role: "",
  houseKeyAccess: HouseKeyAccess.UNKNOWN,
  payment: { method: PaymentMethod.UNKNOWN, handle: null },
  contact: { channel: ContactChannel.UNKNOWN, handle: null },
  startedOn: null,
  notes: "",
};

const profileOf = ({ name, role, houseKeyAccess, payment, contact, startedOn, notes }: Helper): HelperProfile => ({ name, role, houseKeyAccess, payment, contact, startedOn, notes });

const emptyToNull = (value: string): string | null => (value.trim() === "" ? null : value.trim());

function Options<K extends string>({ labels }: { labels: Record<K, string> }) {
  return (
    <>
      {(Object.entries(labels) as [K, string][]).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </>
  );
}

/** helper null = add a new helper. */
export function HelperProfileForm({ helper, onCancel }: { helper: Helper | null; onCancel?: () => void }) {
  const { api, refresh } = useApp();
  const [profile, setProfile] = useState<HelperProfile>(helper === null ? NEW_HELPER_PROFILE : profileOf(helper));
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = (next: Partial<HelperProfile>) => {
    setProfile({ ...profile, ...next });
    setSaved(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (helper === null) {
        const created = await api.call("createHelper", { body: { profile } });
        navigate(routes.agreements(created.helper.helperId));
      } else {
        await api.call("updateHelper", { params: { id: helper.helperId }, body: { helperVersion: helper.version, profile } });
        setSaved(true);
      }
      refresh();
    } catch (e) {
      setError(asClientError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="profile-form" onSubmit={submit}>
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input required value={profile.name} onChange={(e) => edit({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>What they do</span>
          <input required value={profile.role} placeholder="babysitter, cleaner, tutor…" onChange={(e) => edit({ role: e.target.value })} />
        </label>
        <label className="field">
          <span>House key</span>
          <select value={profile.houseKeyAccess} onChange={(e) => edit({ houseKeyAccess: e.target.value as HelperProfile["houseKeyAccess"] })}>
            <Options labels={HOUSE_KEY_LABEL} />
          </select>
        </label>
        <label className="field">
          <span>Started</span>
          <input type="date" value={profile.startedOn ?? ""} onChange={(e) => edit({ startedOn: emptyToNull(e.target.value) })} />
        </label>
        <label className="field">
          <span>Pay with</span>
          <select value={profile.payment.method} onChange={(e) => edit({ payment: { ...profile.payment, method: e.target.value as HelperProfile["payment"]["method"] } })}>
            <Options labels={PAYMENT_METHOD_LABEL} />
          </select>
        </label>
        <label className="field">
          <span>Payment handle</span>
          <input value={profile.payment.handle ?? ""} placeholder="@venmo, phone or email" onChange={(e) => edit({ payment: { ...profile.payment, handle: emptyToNull(e.target.value) } })} />
        </label>
        <label className="field">
          <span>Contact by</span>
          <select value={profile.contact.channel} onChange={(e) => edit({ contact: { ...profile.contact, channel: e.target.value as HelperProfile["contact"]["channel"] } })}>
            <Options labels={CONTACT_CHANNEL_LABEL} />
          </select>
        </label>
        <label className="field">
          <span>Phone or email</span>
          <input value={profile.contact.handle ?? ""} onChange={(e) => edit({ contact: { ...profile.contact, handle: emptyToNull(e.target.value) } })} />
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea rows={2} value={profile.notes} onChange={(e) => edit({ notes: e.target.value })} />
      </label>
      {error !== null && <ErrorNote error={error} />}
      <div className="form-actions">
        <span className="muted small">{saved ? "Saved." : "Details save directly. Agreements and approvals still ask you to confirm."}</span>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="primary" disabled={busy}>
          {helper === null ? "Add helper" : "Save details"}
        </button>
      </div>
    </form>
  );
}
