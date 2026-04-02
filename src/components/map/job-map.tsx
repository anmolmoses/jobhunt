"use client";

import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ExternalLink, MapPin, DollarSign, Building2, Bookmark, BookmarkCheck } from "lucide-react";

export interface MapJob {
  id: number;
  title: string;
  company: string;
  location: string;
  salary: string | null;
  isRemote: boolean;
  applyUrl: string | null;
  companyLogo: string | null;
  postedAt: string | null;
  provider: string;
  latitude: number;
  longitude: number;
  savedJobId: number | null;
}

function createLogoIcon(logoUrl: string | null, isSaved: boolean): L.DivIcon {
  const borderColor = isSaved ? "#22c55e" : "#6366f1";
  const bg = "#1e1e2e";

  if (logoUrl) {
    return L.divIcon({
      className: "custom-logo-marker",
      html: `<div style="
        width: 40px; height: 40px; border-radius: 10px;
        border: 2.5px solid ${borderColor};
        background: ${bg}; overflow: hidden;
        display: flex; align-items: center; justify-content: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      "><img src="${logoUrl}" style="width: 30px; height: 30px; object-fit: contain; border-radius: 4px;" onerror="this.style.display='none';this.parentElement.innerHTML='<div style=\\'color:#94a3b8;font-size:16px;font-weight:700;\\'>&#x1F3E2;</div>'" /></div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -24],
    });
  }

  return L.divIcon({
    className: "custom-logo-marker",
    html: `<div style="
      width: 40px; height: 40px; border-radius: 10px;
      border: 2.5px solid ${borderColor};
      background: ${bg}; overflow: hidden;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.5);
      color: #94a3b8; font-size: 18px; font-weight: 700;
    ">&#x1F3E2;</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -24],
  });
}

/**
 * Offset markers at identical coordinates so they fan out in a spiral.
 * Without this, 46 jobs at "Bengaluru" stack on the exact same pixel.
 */
function spreadOverlappingMarkers(jobs: MapJob[]): (MapJob & { displayLat: number; displayLng: number })[] {
  // Group by rounded coordinates (same ~100m radius)
  const groups = new Map<string, number[]>();
  jobs.forEach((job, i) => {
    const key = `${job.latitude.toFixed(3)},${job.longitude.toFixed(3)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });

  return jobs.map((job, i) => {
    // Find which group this job belongs to
    const key = `${job.latitude.toFixed(3)},${job.longitude.toFixed(3)}`;
    const group = groups.get(key)!;

    if (group.length <= 1) {
      return { ...job, displayLat: job.latitude, displayLng: job.longitude };
    }

    // Position in the group
    const idx = group.indexOf(i);
    const total = group.length;

    // Spiral layout: each marker gets placed in an expanding spiral
    // The radius grows with the number of markers
    const angle = (idx / total) * 2 * Math.PI + (idx * 0.5); // Golden angle-ish
    const ring = Math.floor(idx / 8) + 1; // Which ring (8 per ring)
    const radius = ring * 0.003; // ~300m per ring at equator

    return {
      ...job,
      displayLat: job.latitude + radius * Math.cos(angle),
      displayLng: job.longitude + radius * Math.sin(angle),
    };
  });
}

function FitBounds({ jobs }: { jobs: MapJob[] }) {
  const map = useMap();

  useEffect(() => {
    if (jobs.length === 0) return;
    const bounds = L.latLngBounds(jobs.map((j) => [j.latitude, j.longitude]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  }, [jobs, map]);

  return null;
}

function FlyToJob({ job }: { job: MapJob | null }) {
  const map = useMap();

  useEffect(() => {
    if (!job) return;
    map.flyTo([job.latitude, job.longitude], 14, { duration: 0.8 });
  }, [job, map]);

  return null;
}

interface JobMapProps {
  jobs: MapJob[];
  highlightedJob: MapJob | null;
  onSave?: (jobId: number) => void;
  onUnsave?: (jobId: number) => void;
  onMarkerClick?: (job: MapJob) => void;
}

export function JobMap({ jobs, highlightedJob, onSave, onUnsave, onMarkerClick }: JobMapProps) {
  const center: [number, number] = jobs.length > 0
    ? [
        jobs.reduce((s, j) => s + j.latitude, 0) / jobs.length,
        jobs.reduce((s, j) => s + j.longitude, 0) / jobs.length,
      ]
    : [39.8283, -98.5795];

  // Spread overlapping markers
  const spreadJobs = spreadOverlappingMarkers(jobs);

  return (
    <MapContainer
      center={center}
      zoom={4}
      className="h-full w-full"
      style={{ background: "#0d1117" }}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
      />
      <FitBounds jobs={jobs} />
      <FlyToJob job={highlightedJob} />

      {spreadJobs.map((job) => (
        <Marker
          key={job.id}
          position={[job.displayLat, job.displayLng]}
          icon={createLogoIcon(job.companyLogo, !!job.savedJobId)}
          eventHandlers={{
            click: () => onMarkerClick?.(job),
          }}
        >
          <Popup minWidth={260} maxWidth={320} className="dark-popup">
            <div style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                {job.companyLogo ? (
                  <img src={job.companyLogo} alt="" style={{ width: "36px", height: "36px", borderRadius: "8px", objectFit: "contain", border: "1px solid #333" }} />
                ) : (
                  <div style={{ width: "36px", height: "36px", borderRadius: "8px", background: "#1e1e2e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>&#x1F3E2;</div>
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "13px", lineHeight: 1.3 }}>{job.title}</div>
                  <div style={{ fontSize: "12px", color: "#888" }}>{job.company}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", fontSize: "11px", color: "#999", marginBottom: "6px" }}>
                <span>{job.location}</span>
                {job.salary && <span> &middot; {job.salary}</span>}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "8px" }}>
                {job.isRemote && <span style={{ padding: "2px 8px", borderRadius: "99px", background: "#064e3b", color: "#6ee7b7", fontSize: "11px" }}>Remote</span>}
                <span style={{ padding: "2px 8px", borderRadius: "99px", background: "#1e293b", color: "#94a3b8", fontSize: "11px" }}>{job.provider}</span>
                {job.savedJobId && <span style={{ padding: "2px 8px", borderRadius: "99px", background: "#1e3a5f", color: "#60a5fa", fontSize: "11px" }}>Saved</span>}
              </div>
              <div style={{ display: "flex", gap: "6px" }}>
                {job.applyUrl && (
                  <a href={job.applyUrl} target="_blank" rel="noopener noreferrer" style={{ padding: "4px 12px", borderRadius: "6px", background: "#6366f1", color: "white", fontSize: "12px", textDecoration: "none", fontWeight: 500 }}>Apply</a>
                )}
                <button
                  onClick={() => job.savedJobId ? onUnsave?.(job.id) : onSave?.(job.id)}
                  style={{ padding: "4px 12px", borderRadius: "6px", background: "#1e293b", color: "#e2e8f0", fontSize: "12px", border: "1px solid #334155", cursor: "pointer" }}
                >
                  {job.savedJobId ? "Saved" : "Save"}
                </button>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
