"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { normalizeRole } from "@/lib/rbac";
import { runWithTenant } from "@/lib/multitenant/request";

/**
 * Server actions de la tienda (RPC). La gestión (crear/editar/borrar productos,
 * pedidos, estados) exige ADMIN. La única lectura pública es el escaparate de
 * productos ACTIVOS (getProducts sin includeInactive). Todo corre en runWithTenant.
 */
async function assertStoreAdmin() {
  const session = await getServerSession(authOptions);
  const role = normalizeRole((session?.user as { role?: string } | undefined)?.role);
  if (!session?.user || role !== "ADMIN") throw new Error("No autorizado");
}

// --- PRODUCTS ---

export async function getProducts(includeInactive = false) {
  return runWithTenant(async () => {
  // Ver productos INACTIVOS es solo para la gestión (ADMIN); el escaparate público
  // solo lee los activos.
  if (includeInactive) await assertStoreAdmin();
  try {
    const products = await prisma.product.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { createdAt: "desc" },
    });
    return { success: true, data: products };
  } catch (error) {
    console.error("Error fetching products:", error);
    return { success: false, error: "Error al obtener los productos" };
  }
  });
}

export async function getProductById(id: string) {
  return runWithTenant(async () => {
  await assertStoreAdmin();
  try {
    const product = await prisma.product.findUnique({
      where: { id },
    });
    if (!product) return { success: false, error: "Producto no encontrado" };
    return { success: true, data: product };
  } catch (error) {
    console.error("Error fetching product:", error);
    return { success: false, error: "Error al obtener el producto" };
  }
  });
}

export async function createProduct(data: {
  name: string;
  description?: string | null;
  price: number;
  stock: number;
  image?: string | null;
  category?: string | null;
  isActive: boolean;
}) {
  return runWithTenant(async () => {
  await assertStoreAdmin();
  try {
    const product = await prisma.product.create({
      data,
    });
    revalidatePath("/admin/store");
    revalidatePath("/store");
    return { success: true, data: product };
  } catch (error) {
    console.error("Error creating product:", error);
    return { success: false, error: "Error al crear el producto" };
  }
  });
}

export async function updateProduct(
  id: string,
  data: {
    name?: string;
    description?: string | null;
    price?: number;
    stock?: number;
    image?: string | null;
    category?: string | null;
    isActive?: boolean;
  }
) {
  return runWithTenant(async () => {
  await assertStoreAdmin();
  try {
    const product = await prisma.product.update({
      where: { id },
      data,
    });
    revalidatePath("/admin/store");
    revalidatePath("/store");
    return { success: true, data: product };
  } catch (error) {
    console.error("Error updating product:", error);
    return { success: false, error: "Error al actualizar el producto" };
  }
  });
}

export async function deleteProduct(id: string) {
  return runWithTenant(async () => {
  await assertStoreAdmin();
  try {
    await prisma.product.delete({
      where: { id },
    });
    revalidatePath("/admin/store");
    revalidatePath("/store");
    return { success: true };
  } catch (error) {
    console.error("Error deleting product:", error);
    return { success: false, error: "Error al eliminar el producto. Asegúrate de que no esté en ningún pedido." };
  }
  });
}

// --- ORDERS ---

export async function getOrders() {
  return runWithTenant(async () => {
  await assertStoreAdmin();
  try {
    const orders = await prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        member: true,
      },
    });
    return { success: true, data: orders };
  } catch (error) {
    console.error("Error fetching orders:", error);
    return { success: false, error: "Error al obtener los pedidos" };
  }
  });
}

export async function createOrder(data: {
  customerName: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  shippingAddress?: string | null;
  shippingNotes?: string | null;
  memberId?: string | null;
  items: { productId: string; quantity: number; unitPrice: number }[];
}) {
  return runWithTenant(async () => {
  await assertStoreAdmin();
  try {
    // Generar un número de pedido único (ej: ORD-2026-ABC12)
    const orderNumber = `ORD-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    // Calcular el total
    const totalAmount = data.items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);

    const order = await prisma.order.create({
      data: {
        orderNumber,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        customerPhone: data.customerPhone,
        shippingAddress: data.shippingAddress,
        shippingNotes: data.shippingNotes,
        memberId: data.memberId,
        totalAmount,
        status: "PENDING",
        items: {
          create: data.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalPrice: item.quantity * item.unitPrice,
          }))
        }
      },
      include: {
        items: {
          include: {
            product: true
          }
        }
      }
    });

    // Actualizar el stock de los productos
    for (const item of data.items) {
      await prisma.product.update({
        where: { id: item.productId },
        data: {
          stock: {
            decrement: item.quantity
          }
        }
      });
    }

    revalidatePath("/admin/store/orders");
    revalidatePath("/store");

    return { success: true, data: order };
  } catch (error) {
    console.error("Error creating order:", error);
    return { success: false, error: "Error al crear el pedido" };
  }
  });
}

export async function updateOrderStatus(id: string, status: string, trackingNumber?: string) {
  return runWithTenant(async () => {
  await assertStoreAdmin();
  try {
    const data: { status: string; trackingNumber?: string } = { status };
    if (trackingNumber !== undefined) {
      data.trackingNumber = trackingNumber;
    }

    const order = await prisma.order.update({
      where: { id },
      data,
    });

    revalidatePath("/admin/store/orders");
    return { success: true, data: order };
  } catch (error) {
    console.error("Error updating order:", error);
    return { success: false, error: "Error al actualizar el pedido" };
  }
  });
}
