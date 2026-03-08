# Developing guide

## Running locally

```sh
npm i
npm run dev
```

## Testing

```sh
npm run clean
npm run build
npm run typecheck
npm run lint
npm run test
```

## Deploying

### Building a one-off package

```sh
npm run clean
npm ci
npm run release:check
```

### Deploying a new version

```sh
npm run release
```

or for alpha release:

```sh
npm run alpha
```
