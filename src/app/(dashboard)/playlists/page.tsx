"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, List, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface Playlist {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  _count: { items: number };
}

export default function PlaylistsPage() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  async function fetchPlaylists() {
    try {
      const res = await fetch("/api/playlists");
      if (res.ok) {
        const data = await res.json();
        setPlaylists(data);
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlaylists(); }, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      if (res.ok) {
        toast.success("สร้าง Playlist สำเร็จ");
        setNewName("");
        setDialogOpen(false);
        fetchPlaylists();
      } else {
        const data = await res.json();
        toast.error(data.error || "เกิดข้อผิดพลาด");
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`ต้องการลบ Playlist "${name}" ใช่หรือไม่?`)) return;
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("ลบ Playlist สำเร็จ");
        fetchPlaylists();
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">จัดการ Playlist</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />สร้าง Playlist ใหม่</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>สร้าง Playlist ใหม่</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label htmlFor="name">ชื่อ Playlist</Label>
                <Input id="name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="เช่น ช่องข่าว, ช่องกีฬา" />
              </div>
              <Button onClick={handleCreate} className="w-full">สร้าง</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {playlists.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <List className="mx-auto mb-4 h-12 w-12" />
            <p>ยังไม่มี Playlist</p>
            <p className="text-sm">กดปุ่ม &quot;สร้าง Playlist ใหม่&quot; เพื่อเริ่มต้น</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {playlists.map((playlist) => (
            <Card key={playlist.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`/playlists/${playlist.id}`)}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">{playlist.name}</CardTitle>
                <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(playlist.id, playlist.name); }}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{playlist._count.items} ช่องรายการ</p>
                <p className="text-xs text-muted-foreground mt-1">
                  อัปเดต: {new Date(playlist.updatedAt).toLocaleString("th-TH")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
