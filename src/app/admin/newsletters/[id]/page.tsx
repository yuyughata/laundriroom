import { redirect } from "next/navigation";

export default function OldNewsletter({ params }: { params: { id: string } }) {
  redirect(`/admin/emails/${params.id}`);
}
