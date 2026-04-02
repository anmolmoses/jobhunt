"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  Loader2, Users, Send, Link2, Mail, Calendar, MessageSquare,
  Trash2, ExternalLink, Clock,
} from "lucide-react";

interface OutreachRecord {
  id: number;
  contactId: number;
  channel: string;
  status: string;
  messageTemplate: string | null;
  notes: string | null;
  sentAt: string | null;
  repliedAt: string | null;
  followUpDate: string | null;
  createdAt: string;
  updatedAt: string;
  contact: {
    id: number;
    companyName: string;
    personName: string;
    personTitle: string | null;
    personLinkedin: string | null;
    personEmail: string | null;
    personImageUrl: string | null;
    connectionType: string | null;
    mutualConnections: string;
    introducerName: string | null;
  };
}

const STATUS_OPTIONS = [
  { value: "planned", label: "Planned", color: "bg-gray-100 text-gray-800" },
  { value: "sent", label: "Sent", color: "bg-blue-100 text-blue-800" },
  { value: "replied", label: "Replied", color: "bg-green-100 text-green-800" },
  { value: "no_reply", label: "No Reply", color: "bg-yellow-100 text-yellow-800" },
  { value: "meeting_scheduled", label: "Meeting Scheduled", color: "bg-purple-100 text-purple-800" },
  { value: "declined", label: "Declined", color: "bg-red-100 text-red-800" },
];

const CHANNEL_ICONS: Record<string, typeof Link2> = {
  linkedin: Link2,
  email: Mail,
  other: MessageSquare,
};

export default function NetworkingPage() {
  const { toast } = useToast();
  const [records, setRecords] = useState<OutreachRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [editingNotes, setEditingNotes] = useState<number | null>(null);

  useEffect(() => {
    loadRecords();
  }, []);

  const loadRecords = async () => {
    try {
      const res = await fetch("/api/outreach");
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      toast("Failed to load outreach records", "error");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (id: number, status: string) => {
    try {
      await fetch(`/api/outreach/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, status } : r))
      );
      toast(`Status updated to ${status}`, "success");
    } catch {
      toast("Failed to update", "error");
    }
  };

  const updateNotes = async (id: number, notes: string) => {
    try {
      await fetch(`/api/outreach/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      setRecords((prev) =>
        prev.map((r) => (r.id === id ? { ...r, notes } : r))
      );
      setEditingNotes(null);
      toast("Notes updated", "success");
    } catch {
      toast("Failed to update notes", "error");
    }
  };

  const deleteRecord = async (id: number) => {
    try {
      await fetch(`/api/outreach/${id}`, { method: "DELETE" });
      setRecords((prev) => prev.filter((r) => r.id !== id));
      toast("Outreach record deleted", "success");
    } catch {
      toast("Failed to delete", "error");
    }
  };

  const filtered = filterStatus === "all"
    ? records
    : records.filter((r) => r.status === filterStatus);

  const statusCounts = records.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Networking</h1>
        <p className="text-muted-foreground mt-1">Track your outreach to contacts at target companies</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold">{records.length}</p>
            <p className="text-xs text-muted-foreground">Total Outreach</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-blue-600">{statusCounts["sent"] || 0}</p>
            <p className="text-xs text-muted-foreground">Messages Sent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-green-600">{statusCounts["replied"] || 0}</p>
            <p className="text-xs text-muted-foreground">Replies Received</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <p className="text-2xl font-bold text-purple-600">{statusCounts["meeting_scheduled"] || 0}</p>
            <p className="text-xs text-muted-foreground">Meetings Scheduled</p>
          </CardContent>
        </Card>
      </div>

      {/* Status Filters */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterStatus("all")}
          className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            filterStatus === "all" ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
          }`}
        >
          All ({records.length})
        </button>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilterStatus(s.value)}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              filterStatus === s.value ? "border-primary bg-primary text-primary-foreground" : "border-input hover:bg-accent"
            }`}
          >
            {s.label} ({statusCounts[s.value] || 0})
          </button>
        ))}
      </div>

      {/* Outreach List */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            {records.length === 0 ? (
              <div>
                <p className="font-medium">No outreach tracked yet</p>
                <p className="text-sm mt-1">Click &ldquo;Find Contacts&rdquo; on any job to discover people in your network, then track your outreach here.</p>
              </div>
            ) : (
              <p>No outreach with status &ldquo;{filterStatus}&rdquo;</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => {
            const ChannelIcon = CHANNEL_ICONS[record.channel] || MessageSquare;
            const mutuals = (() => {
              try { return JSON.parse(record.contact.mutualConnections || "[]"); }
              catch { return []; }
            })();

            return (
              <Card key={record.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      {record.contact.personImageUrl ? (
                        <img src={record.contact.personImageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted shrink-0">
                          <Users className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-semibold">{record.contact.personName}</h3>
                        {record.contact.personTitle && (
                          <p className="text-sm text-muted-foreground">{record.contact.personTitle}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">
                          at <span className="font-medium">{record.contact.companyName}</span>
                        </p>

                        <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <ChannelIcon className="h-3 w-3" />
                            via {record.channel}
                          </span>
                          {record.sentAt && (
                            <span className="flex items-center gap-1">
                              <Send className="h-3 w-3" />
                              Sent {new Date(record.sentAt).toLocaleDateString()}
                            </span>
                          )}
                          {record.repliedAt && (
                            <span className="flex items-center gap-1 text-green-600">
                              Replied {new Date(record.repliedAt).toLocaleDateString()}
                            </span>
                          )}
                          {record.contact.introducerName && (
                            <Badge variant="outline" className="text-xs">
                              via {record.contact.introducerName}
                            </Badge>
                          )}
                          {mutuals.length > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {mutuals.length} mutual{mutuals.length > 1 ? "s" : ""}
                            </Badge>
                          )}
                        </div>

                        {/* Notes */}
                        <div className="mt-2">
                          {editingNotes === record.id ? (
                            <div className="flex gap-2">
                              <Textarea
                                defaultValue={record.notes || ""}
                                placeholder="Add notes..."
                                rows={2}
                                className="text-sm"
                                id={`notes-${record.id}`}
                              />
                              <div className="flex flex-col gap-1">
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    const el = document.getElementById(`notes-${record.id}`) as HTMLTextAreaElement;
                                    updateNotes(record.id, el.value);
                                  }}
                                >
                                  Save
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingNotes(null)}>
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEditingNotes(record.id)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              {record.notes || "Add notes..."}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Select
                        value={record.status}
                        onChange={(e) => updateStatus(record.id, e.target.value)}
                        className="w-40"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </Select>
                      {record.contact.personLinkedin && (
                        <a href={record.contact.personLinkedin} target="_blank" rel="noopener noreferrer">
                          <Button variant="outline" size="icon">
                            <Link2 className="h-4 w-4" />
                          </Button>
                        </a>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => deleteRecord(record.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
