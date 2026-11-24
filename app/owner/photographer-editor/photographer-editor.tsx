"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Photographer = {
  id: string; name: string; bio: string; location: string; categories: string[];
  profileImageUrl: string; heroImageUrl: string; status: string; publishState: string;
};
type Draft = {
  publicName: string; bio: string; location: string; categories: string;
  profileImageUrl: string; heroImageUrl: string;
};
function imagePreviewCandidates(input: string): string[] {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:") return [];
    if (url.hostname === "drive.google.com" || url.hostname === "drive.usercontent.google.com") {
      const fileId = url.searchParams.get("id") || url.pathname.match(/^\/file\/d\/([^/]+)/)?.[1];
      if (fileId) {
        const id = encodeURIComponent(fileId);
        return [
          `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
          `https://lh3.googleusercontent.com/d/${id}=w1200`,
          `https://drive.google.com/uc?export=view&id=${id}`,
          url.toString()
        ].filter((value, index, values) => values.indexOf(value) === index);
      }
    }
    return [url.toString()];
  } catch { return []; }
}
function imagePreviewUrl(input: string): string { return imagePreviewCandidates(input)[0] || ""; }
function handleImagePreviewError(event: React.SyntheticEvent<HTMLImageElement>, input: string) {
  const image = event.currentTarget;
  const candidates = imagePreviewCandidates(input);
  const current = image.src;
  const currentIndex = candidates.findIndex(value => value === current);
  const next = candidates[currentIndex + 1];
  if (next && next !== current) image.src = next;
  else image.style.display = "none";
}

const emptyDraft: Draft = { publicName: "", bio: "", location: "", categories: "", profileImageUrl: "", heroImageUrl: "" };

export default function PhotographerEditor() {
  const [rows, setRows] = useState<Photographer[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"profile" | "hero" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/owner/photographers", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Photographer records could not be loaded.");
      const items = (Array.isArray(data.photographers) ? data.photographers : []) as Photographer[];
      setRows(items);
      const current = items.find(item => item.id === selectedId) ?? items[0];
      if (current) {
        setSelectedId(current.id);
        setDraft({
          publicName: current.name, bio: current.bio, location: current.location,
          categories: current.categories.join(", "),
          profileImageUrl: current.profileImageUrl, heroImageUrl: current.heroImageUrl
        });
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load photographers."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const selected = rows.find(item => item.id === selectedId);
  const filtered = useMemo(() => rows.filter(item => (item.name + " " + item.location + " " + item.id).toLowerCase().includes(query.toLowerCase())), [rows, query]);

  function choose(id: string) {
    const item = rows.find(row => row.id === id);
    if (!item) return;
    setSelectedId(id); setMessage(""); setError("");
    setDraft({
      publicName: item.name, bio: item.bio, location: item.location,
      categories: item.categories.join(", "),
      profileImageUrl: item.profileImageUrl, heroImageUrl: item.heroImageUrl
    });
  }

  async function upload(kind: "profile" | "hero", file?: File) {
    if (!file || !selectedId) return;
    setUploading(kind); setMessage(""); setError("");
    try {
      const form = new FormData();
      form.set("image", file); form.set("kind", kind);
      const response = await fetch("/api/owner/photographers/" + encodeURIComponent(selectedId) + "/images", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Image upload failed.");
      setDraft(current => ({ ...current, [kind === "profile" ? "profileImageUrl" : "heroImageUrl"]: data.url }));
      setMessage("Image saved successfully.");
    } catch (e) { setError(e instanceof Error ? e.message : "Image upload failed."); }
    finally { setUploading(null); }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedId) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/owner/photographers/" + encodeURIComponent(selectedId), {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...draft,
          categories: draft.categories.split(",").map(value => value.trim()).filter(Boolean)
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Profile could not be saved.");
      setRows(current => current.map(item => item.id === selectedId ? {
        ...item, name: draft.publicName, bio: draft.bio, location: draft.location,
        categories: draft.categories.split(",").map(value => value.trim()).filter(Boolean),
        profileImageUrl: draft.profileImageUrl, heroImageUrl: draft.heroImageUrl
      } : item));
      setMessage(data.unchanged ? "No profile changes were needed. The saved image links are unchanged." : "Profile changes saved successfully. The image links are now attached to this photographer profile. Approval and publication settings were left unchanged.");
    } catch (e) { setError(e instanceof Error ? e.message : "Profile could not be saved."); }
    finally { setSaving(false); }
  }

  const field = (key: keyof Draft, value: string) => setDraft(current => ({ ...current, [key]: value }));

  return <main className="owner-login" style={{ minHeight: "100vh", alignItems: "flex-start", padding: "40px 18px" }}>
    <section className="owner-login-card" style={{ width: "min(980px,100%)", maxWidth: 980 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div><p className="owner-eyebrow">DIRECTORY MANAGEMENT</p><h1 style={{ fontSize: 38 }}>Edit photographer <em>profiles.</em></h1></div>
        <Link href="/owner" className="owner-secondary">← Owner workspace</Link>
      </div>
      <p>Edit approved photographer information and images. Uploaded images are stored in the connected Google Drive and receive a shareable link for the public photographer profile.</p>
      {(uploading || message || error) && <div role={error ? "alert" : "status"} aria-live="polite" style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 10000, width: "min(560px, calc(100vw - 32px))", margin: 0, padding: "16px 18px", border: error ? "2px solid #b42318" : "2px solid #58734f", background: error ? "#fff4f2" : "#f3f7f1", color: error ? "#8f1d14" : "#263d29", borderRadius: 10, boxShadow: "0 8px 28px rgba(0,0,0,.22)" }}>
        {uploading ? <><strong>Uploading {uploading === "hero" ? "cover image" : "profile photo"}…</strong><p style={{ margin: "6px 0 0" }}>Please keep this page open. We will confirm when Google Drive has stored the image.</p></> : error ? <><strong>We could not complete that action.</strong><p style={{ margin: "6px 0 0" }}>{error}</p></> : <><strong>{message}</strong></>}
      </div>}
      {loading ? <p>Loading photographer records…</p> : error && !rows.length ? <p role="alert" className="owner-error">{error}</p> : <>
        <label>Choose photographer</label>
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search by name, location or ID" />
        <select value={selectedId} onChange={event => choose(event.target.value)} style={{ width: "100%", margin: "8px 0 20px", padding: 12 }}>
          {filtered.map(item => <option key={item.id} value={item.id}>{item.name} · {item.location || "No location"} · {item.publishState}</option>)}
        </select>
        {!selected ? <p>No approved photographer records are available to edit.</p> : <form onSubmit={save}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 18 }}>
            <div><label>Public name</label><input value={draft.publicName} onChange={e => field("publicName", e.target.value)} maxLength={120} required /></div>
            <div><label>Primary location</label><input value={draft.location} onChange={e => field("location", e.target.value)} maxLength={160} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label>Biography</label><textarea value={draft.bio} onChange={e => field("bio", e.target.value)} rows={5} maxLength={5000} /></div>
            <div style={{ gridColumn: "1 / -1" }}><label>Categories (separate with commas)</label><input value={draft.categories} onChange={e => field("categories", e.target.value)} placeholder="Portrait, Wedding, Events" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 18, marginTop: 22 }}>
            {(["profile", "hero"] as const).map(kind => {
              const key = kind === "profile" ? "profileImageUrl" : "heroImageUrl";
              return <section key={kind} style={{ border: "1px solid #dedbd3", padding: 14 }}>
                <label>{kind === "profile" ? "Profile photo" : "Cover / hero photo"}</label>
                {draft[key] && <img src={imagePreviewUrl(draft[key])} alt={kind === "profile" ? "Profile photo preview" : "Cover photo preview"} onError={e => handleImagePreviewError(e, draft[key])} style={{ width: "100%", height: 190, objectFit: "cover", objectPosition: "center", margin: "8px 0", border: "1px solid #dedbd3", borderRadius: 6, background: "#f1eee8" }} />}
                <label>Paste an HTTPS image URL</label>
                <input type="url" value={draft[key]} onChange={e => field(key, e.target.value)} placeholder="https://…" />
                <label style={{ marginTop: 12 }}>Or upload from this device</label>
                <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading !== null} onChange={e => { const file = e.target.files?.[0]; void upload(kind, file); e.currentTarget.value = ""; }} />
                <small>JPG, PNG or WebP · Maximum 8 MB · Stored in Google Drive. Uploaded images are made viewable by anyone with the link so they can appear on the public website.</small>
                {uploading === kind && <p>Uploading to Drive…</p>}
              </section>;
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
            <button className="owner-primary" disabled={saving || uploading !== null}>{saving ? "Saving profile…" : "Save profile changes"}</button>
            <span className="owner-status-pill">{selected.status} · {selected.publishState}</span>
          </div>
          <p style={{ fontSize: 12, color: "#77736d", lineHeight: 1.7 }}>Saving updates only the name, biography, location, categories and image links. Approval status, publication state, membership tier and account identifiers are preserved.</p>
        </form>}
      </>}
    </section>
  </main>;
}
