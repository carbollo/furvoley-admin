"use client";

import { useState } from "react";
import { ShoppingCart, X, Plus, Minus, Trash2 } from "lucide-react";

export function useCart() {
  const [cart, setCart] = useState<{ product: any; quantity: number }[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock) return prev;
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setIsOpen(true);
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          const newQ = item.quantity + delta;
          if (newQ < 1) return item;
          if (newQ > item.product.stock) return item;
          return { ...item, quantity: newQ };
        }
        return item;
      })
    );
  };

  const total = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  return { cart, isOpen, setIsOpen, addToCart, removeFromCart, updateQuantity, total };
}

export function CartDrawer({
  cart,
  isOpen,
  setIsOpen,
  removeFromCart,
  updateQuantity,
  total,
}: any) {
  if (!isOpen) return null;

  const handleWhatsAppCheckout = () => {
    if (cart.length === 0) return;

    let message = "¡Hola! Me gustaría hacer un pedido en la tienda de Furvoley:%0A%0A";
    
    cart.forEach((item: any) => {
      message += `- ${item.quantity}x ${item.product.name} (${item.product.price}€/ud)%0A`;
    });
    
    message += `%0A*Total: ${total.toFixed(2)}€*%0A%0A`;
    message += "¿Cómo podemos proceder con el pago y la entrega?";

    // Reemplaza este número por el número real del club
    const phoneNumber = "34600000000"; 
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
    
    window.open(whatsappUrl, "_blank");
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50 transition-opacity" onClick={() => setIsOpen(false)} />
      
      <div className="fixed inset-y-0 right-0 max-w-md w-full flex">
        <div className="w-full h-full bg-white shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-6 border-b border-stone-200">
            <h2 className="text-lg font-medium text-stone-900 flex items-center">
              <ShoppingCart className="w-5 h-5 mr-2" />
              Tu carrito
            </h2>
            <button onClick={() => setIsOpen(false)} className="text-stone-400 hover:text-stone-500">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-stone-500">
                <ShoppingCart className="w-12 h-12 mb-4 text-stone-300" />
                <p>Tu carrito está vacío</p>
              </div>
            ) : (
              <ul className="divide-y divide-stone-200">
                {cart.map((item: any) => (
                  <li key={item.product.id} className="py-6 flex">
                    <div className="flex-shrink-0 w-20 h-20 bg-stone-100 rounded-md overflow-hidden">
                      {item.product.image ? (
                        <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-stone-200 text-stone-400">
                          <ShoppingCart className="w-8 h-8" />
                        </div>
                      )}
                    </div>

                    <div className="ml-4 flex-1 flex flex-col">
                      <div>
                        <div className="flex justify-between text-base font-medium text-stone-900">
                          <h3 className="line-clamp-2">{item.product.name}</h3>
                          <p className="ml-4 font-bold">{(item.product.price * item.quantity).toFixed(2)}€</p>
                        </div>
                      </div>
                      <div className="flex-1 flex items-end justify-between text-sm mt-4">
                        <div className="flex items-center border border-stone-300 rounded-md">
                          <button
                            onClick={() => updateQuantity(item.product.id, -1)}
                            className="p-2 text-stone-600 hover:bg-stone-100"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <span className="px-4 font-medium">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.product.id, 1)}
                            className="p-2 text-stone-600 hover:bg-stone-100"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeFromCart(item.product.id)}
                          className="font-medium text-red-600 hover:text-red-500 flex items-center"
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {cart.length > 0 && (
            <div className="border-t border-stone-200 px-4 py-6 sm:px-6">
              <div className="flex justify-between text-xl font-bold text-stone-900 mb-4">
                <p>Total</p>
                <p>{total.toFixed(2)}€</p>
              </div>
              <p className="mt-0.5 text-sm text-stone-500 mb-6">
                El pago y envío se gestionarán a través de WhatsApp con un administrador del club.
              </p>
              <button
                onClick={handleWhatsAppCheckout}
                className="w-full flex justify-center items-center px-6 py-4 border border-transparent rounded-md shadow-sm text-lg font-bold text-white bg-green-600 hover:bg-green-700 transition-colors"
              >
                Hacer pedido por WhatsApp
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
