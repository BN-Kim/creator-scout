import { redirect } from "next/navigation";

export default function OperationsPage(): never {
  redirect("/runs/new");
}
