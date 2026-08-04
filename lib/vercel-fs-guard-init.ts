import { installVercelFsGuard } from './vercel-fs-guard';

// import 側効果で即パッチ（analyze/chat から先頭 import する）
installVercelFsGuard();
