"use client";

import { useCart, CartDrawer } from "@/components/store/Cart";
import { ShoppingCart, Package, Tag, Plus } from "lucide-react";

export default function StoreFront({ products }: { products: any[] }) {
  const { cart, isOpen, setIsOpen, addToCart, removeFromCart, updateQuantity, total } = useCart();

  const cartItemsCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header de la Tienda */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-2xl font-extrabold text-blue-600 tracking-tight">Furvoley Store</h1>
          
          <button
            onClick={() => setIsOpen(true)}
            className="relative p-2 text-gray-600 hover:text-blue-600 transition-colors"
          >
            <ShoppingCart className="w-6 h-6" />
            {cartItemsCount > 0 && (
              <span className="absolute top-0 right-0 inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white transform translate-x-1/4 -translate-y-1/4 bg-red-600 rounded-full">
                {cartItemsCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Catálogo */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">Equipación Oficial</h2>
          <p className="mt-4 max-w-2xl mx-auto text-xl text-gray-500">
            Viste los colores de tu club. Haz tu pedido y coordina el pago y la entrega directamente por WhatsApp.
          </p>
        </div>

        {products.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl shadow-sm border border-gray-100">
            <Package className="mx-auto h-16 w-16 text-gray-300 mb-4" />
            <h3 className="text-xl font-medium text-gray-900">Tienda vacía</h3>
            <p className="mt-2 text-gray-500">Pronto añadiremos nuevos productos al catálogo.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {products.map((product) => (
              <div key={product.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col hover:shadow-lg transition-shadow duration-300 group">
                <div className="h-64 bg-gray-100 flex items-center justify-center relative overflow-hidden">
                  {product.image ? (
                    <img 
                      src={product.image} 
                      alt={product.name} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    />
                  ) : (
                    <Package className="w-16 h-16 text-gray-300" />
                  )}
                  {product.stock <= 0 && (
                    <div className="absolute inset-0 bg-white bg-opacity-70 flex items-center justify-center">
                      <span className="bg-red-600 text-white font-bold px-4 py-2 rounded-lg transform -rotate-12 text-lg shadow-lg">
                        AGOTADO
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="p-6 flex-grow flex flex-col">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold text-gray-900 line-clamp-2" title={product.name}>
                      {product.name}
                    </h3>
                  </div>
                  
                  <div className="mb-4">
                    <span className="text-2xl font-extrabold text-blue-600">{product.price.toFixed(2)}€</span>
                  </div>
                  
                  {product.category && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 w-fit mb-4">
                      <Tag className="w-3 h-3 mr-1" /> {product.category}
                    </span>
                  )}
                  
                  <p className="text-sm text-gray-500 line-clamp-3 mb-6 flex-grow">
                    {product.description || "Sin descripción disponible."}
                  </p>
                  
                  <button
                    onClick={() => addToCart(product)}
                    disabled={product.stock <= 0}
                    className={`w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-bold rounded-xl text-white transition-colors shadow-sm ${
                      product.stock > 0 
                        ? "bg-blue-600 hover:bg-blue-700" 
                        : "bg-gray-300 cursor-not-allowed"
                    }`}
                  >
                    {product.stock > 0 ? (
                      <>
                        <Plus className="w-5 h-5 mr-2" />
                        Añadir al carrito
                      </>
                    ) : (
                      "Sin stock"
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <CartDrawer
        cart={cart}
        isOpen={isOpen}
        setIsOpen={setIsOpen}
        removeFromCart={removeFromCart}
        updateQuantity={updateQuantity}
        total={total}
      />
    </div>
  );
}
