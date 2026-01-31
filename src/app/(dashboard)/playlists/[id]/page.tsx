"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, GripVertical, Trash2, Play } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface PlaylistItem {
  id: string;
  channelName: string;
  url: string;
  sortOrder: number;
}

interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
}

function SortableItem({ item, onDelete, onTest }: { item: PlaylistItem; onDelete: (id: string) => void; onTest: (url: string, name: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-3 rounded-lg border bg-white p-3">
      <button {...attributes} {...listeners} className="cursor-grab text-muted-foreground hover:text-foreground">
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{item.channelName}</p>
        <p className="text-sm text-muted-foreground truncate">{item.url}</p>
      </div>
      <Button variant="ghost" size="icon" onClick={() => onTest(item.url, item.channelName)}>
        <Play className="h-4 w-4 text-green-600" />
      </Button>
      <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)}>
        <Trash2 className="h-4 w-4 text-red-500" />
      </Button>
    </div>
  );
}

export default function PlaylistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [loading, setLoading] = useState(true);
  const [newChannel, setNewChannel] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  async function fetchPlaylist() {
    try {
      const res = await fetch(`/api/playlists/${id}`);
      if (res.ok) {
        setPlaylist(await res.json());
      } else {
        toast.error("ไม่พบ Playlist");
        router.push("/playlists");
      }
    } catch {} finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchPlaylist(); }, [id]);

  async function handleAddItem() {
    if (!newChannel.trim() || !newUrl.trim()) {
      toast.error("กรุณากรอกชื่อช่องและ URL");
      return;
    }
    try {
      const res = await fetch(`/api/playlists/${id}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelName: newChannel, url: newUrl }),
      });
      if (res.ok) {
        toast.success("เพิ่มช่องรายการสำเร็จ");
        setNewChannel("");
        setNewUrl("");
        fetchPlaylist();
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  }

  async function handleDeleteItem(itemId: string) {
    try {
      const res = await fetch(`/api/playlists/${id}/items?itemId=${itemId}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("ลบช่องรายการสำเร็จ");
        fetchPlaylist();
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  }

  function handleTest(url: string, channelName: string) {
    router.push(`/testing?url=${encodeURIComponent(url)}&channel=${encodeURIComponent(channelName)}`);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !playlist) return;

    const oldIndex = playlist.items.findIndex((i) => i.id === active.id);
    const newIndex = playlist.items.findIndex((i) => i.id === over.id);
    const newItems = arrayMove(playlist.items, oldIndex, newIndex);

    setPlaylist({ ...playlist, items: newItems });

    try {
      await fetch(`/api/playlists/${id}/items/reorder`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: newItems.map((item, index) => ({ id: item.id, sortOrder: index })),
        }),
      });
    } catch {
      toast.error("เกิดข้อผิดพลาดในการเรียงลำดับ");
      fetchPlaylist();
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!playlist) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push("/playlists")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">{playlist.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>เพิ่มช่องรายการ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <Label htmlFor="channelName">ชื่อช่อง</Label>
              <Input id="channelName" value={newChannel} onChange={(e) => setNewChannel(e.target.value)} placeholder="เช่น ช่อง 3 HD" />
            </div>
            <div className="flex-[2]">
              <Label htmlFor="url">URL (HLS)</Label>
              <Input id="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.com/stream.m3u8" />
            </div>
            <div className="flex items-end">
              <Button onClick={handleAddItem}><Plus className="mr-2 h-4 w-4" />เพิ่ม</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>ช่องรายการ ({playlist.items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {playlist.items.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">ยังไม่มีช่องรายการ</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={playlist.items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {playlist.items.map((item) => (
                    <SortableItem key={item.id} item={item} onDelete={handleDeleteItem} onTest={handleTest} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
