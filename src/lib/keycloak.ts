import Keycloak from 'keycloak-js'

export const LOCAL_AUTH = import.meta.env.VITE_LOCAL_AUTH === 'true'

export const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL ?? 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM ?? 'LarchBound',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID ?? 'larchbound-app',
})