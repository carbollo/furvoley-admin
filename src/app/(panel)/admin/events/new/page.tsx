import { redirect } from "next/navigation";

export default function AdminNewEventRedirectPage() {
  redirect("/events/new");
}
