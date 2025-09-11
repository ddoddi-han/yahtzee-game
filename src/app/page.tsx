"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import { ModeToggle } from "@/components/button/ModeToggle";
import { toast } from "sonner";

// zod 스키마 정의
const formSchema = z.object({
  nick: z
    .string()
    .min(1, { message: "닉네임을 입력해주세요." })
    .max(10, { message: "10자리 이하로 입력해주세요." }),
  room: z
    .string()
    .min(1, { message: "룸 아이디를 입력해주세요." })
    .max(10, { message: "10자리 이하로 입력해주세요." })
    .regex(/^[a-zA-Z0-9_-]+$/, {
      message:
        "룸 아이디는 영문, 숫자, 하이픈(-), 언더스코어(_)만 사용할 수 있습니다.",
    }),
});

type FormValues = z.infer<typeof formSchema>;

export default function Page() {
  const router = useRouter();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { nick: "", room: "" },
  });

  async function onSubmit(values: FormValues) {
    const nick = values.nick.trim();
    const room = values.room.trim();

    // 서버에 방 상태 확인 요청
    const res = await fetch("/api/check-room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: room, nick }),
    });

    const result = await res.json();

    if (!result.ok) {
      toast.error(result.reason); // ❌ 이미 시작된 방이거나 닉네임 중복
      return;
    }

    // ✅ 통과하면 localStorage에 저장 후 방 입장
    localStorage.setItem("chat_nick", nick);
    router.push(`/${room}`);
  }

  return (
    <main className="grid place-items-center h-full">
      <ModeToggle />
      <Card className="w-full max-w-md rounded-2xl shadow-lg">
        <CardHeader>
          <CardTitle className="text-xl">🎲 Yathzee! - 방 입장</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="nick"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>닉네임</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={10}
                        placeholder="게임에서 사용할 닉네임을 입력하세요."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="room"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>룸 아이디</FormLabel>
                    <FormControl>
                      <Input
                        maxLength={10}
                        placeholder="영문, 숫자, - (하이픈), _ (언더스코어)만 입력하세요."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="w-full">
                입장
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </main>
  );
}
