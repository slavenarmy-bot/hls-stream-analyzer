"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Shield } from "lucide-react";
import { toast } from "sonner";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

export default function UsersPage() {
  const { data: session } = useSession();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "USER" });

  async function fetchUsers() {
    try {
      const res = await fetch("/api/users");
      if (res.ok) setUsers(await res.json());
    } catch {} finally { setLoading(false); }
  }

  useEffect(() => { fetchUsers(); }, []);

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="flex h-64 items-center justify-center">
        <Card className="p-8 text-center">
          <Shield className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <p className="text-lg font-medium">ไม่มีสิทธิ์เข้าถึง</p>
          <p className="text-muted-foreground">เฉพาะผู้ดูแลระบบเท่านั้น</p>
        </Card>
      </div>
    );
  }

  function openCreate() {
    setEditUser(null);
    setForm({ name: "", email: "", password: "", role: "USER" });
    setDialogOpen(true);
  }

  function openEdit(user: User) {
    setEditUser(user);
    setForm({ name: user.name, email: user.email, password: "", role: user.role });
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.name || !form.email) {
      toast.error("กรุณากรอกชื่อและอีเมล");
      return;
    }

    try {
      if (editUser) {
        const body: Record<string, string> = { name: form.name, email: form.email, role: form.role };
        if (form.password) body.password = form.password;
        const res = await fetch(`/api/users/${editUser.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          toast.success("แก้ไขผู้ใช้สำเร็จ");
          setDialogOpen(false);
          fetchUsers();
        } else {
          const data = await res.json();
          toast.error(data.error);
        }
      } else {
        if (!form.password || form.password.length < 6) {
          toast.error("รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร");
          return;
        }
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        if (res.ok) {
          toast.success("สร้างผู้ใช้สำเร็จ");
          setDialogOpen(false);
          fetchUsers();
        } else {
          const data = await res.json();
          toast.error(data.error);
        }
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  }

  async function handleDelete(user: User) {
    if (user.id === session?.user?.id) {
      toast.error("ไม่สามารถลบตัวเองได้");
      return;
    }
    if (!confirm(`ต้องการลบผู้ใช้ "${user.name}" ใช่หรือไม่?`)) return;
    try {
      const res = await fetch(`/api/users/${user.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("ลบผู้ใช้สำเร็จ");
        fetchUsers();
      }
    } catch {
      toast.error("เกิดข้อผิดพลาด");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">จัดการผู้ใช้</h1>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />เพิ่มผู้ใช้</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editUser ? "แก้ไขผู้ใช้" : "เพิ่มผู้ใช้ใหม่"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>ชื่อ</Label>
                <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>อีเมล</Label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label>รหัสผ่าน {editUser && "(เว้นว่างถ้าไม่ต้องการเปลี่ยน)"}</Label>
                <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
              </div>
              <div>
                <Label>บทบาท</Label>
                <Select value={form.role} onValueChange={v => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USER">ผู้ใช้ทั่วไป</SelectItem>
                    <SelectItem value="ADMIN">ผู้ดูแลระบบ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSubmit} className="w-full">{editUser ? "บันทึก" : "สร้าง"}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อ</TableHead>
                  <TableHead>อีเมล</TableHead>
                  <TableHead>บทบาท</TableHead>
                  <TableHead>วันที่สร้าง</TableHead>
                  <TableHead className="text-right">จัดการ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(user => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
                        {user.role === "ADMIN" ? "ผู้ดูแลระบบ" : "ผู้ใช้ทั่วไป"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{new Date(user.createdAt).toLocaleString("th-TH")}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(user)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(user)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
