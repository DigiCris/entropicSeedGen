# wallet-gen

Genera 10 seed phrases BIP-39 (24 palabras) y deriva la primera dirección EVM de cada una
(`m/44'/60'/0'/0/0`). Muestra cada semilla en pantalla para anotarla a mano y, al final,
guarda **solo las direcciones públicas** en `addresses.json`.

## Requisitos

- Node.js 22.x

## Instalar

```bash
nvm use            # Node 22 (o instalá Node 22 manualmente)
npm ci --ignore-scripts
```

Si es la primera vez y todavía no existe `package-lock.json`:

```bash
npm install --save-exact @scure/bip39@2.2.0 @scure/bip32@2.2.0 @noble/curves@2.2.0 @noble/hashes@2.2.0 ethers@6.17.0
```

## Verificar (opcional)

```bash
npm run smoke
```

## Ejecutar

```bash
node src/main.js
```

- Se detiene en cada wallet mostrando las 24 palabras y la dirección. Anotá y presioná **Enter**
  para pasar a la siguiente.
- Al terminar muestra las 10 direcciones y pide una confirmación (**Enter**) antes de escribir.
- Escribe dos archivos: `addresses.json` (direcciones públicas) y `addresses.sha256.txt` (su hash).
- Aborta si `addresses.json` ya existe (no sobrescribe). Movelo o borralo para volver a generar.

Requiere una terminal interactiva; no acepta argumentos ni redirección de la salida.
