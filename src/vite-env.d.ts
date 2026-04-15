/// <reference types="vite/client" />

interface ImportMetaEnv {
	readonly VITE_DEPLOY_TARGET?: 'github-pages' | 'docker' | 'local'
}

interface ImportMeta {
	readonly env: ImportMetaEnv
}
