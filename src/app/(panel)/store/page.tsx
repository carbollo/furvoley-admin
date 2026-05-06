import { getProducts } from "@/actions/store";
import StoreFront from "@/components/store/StoreFront";

export const dynamic = "force-dynamic";

export default async function PublicStorePage() {
  const { data: products, success } = await getProducts(false); // Solo productos activos

  if (!success) {
    return <div className="p-8 text-red-500 text-center">Error al cargar la tienda. Vuelve a intentarlo más tarde.</div>;
  }

  return <StoreFront products={products || []} />;
}
