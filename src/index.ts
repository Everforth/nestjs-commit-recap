import { config } from "dotenv";
import { createProgram } from "./cli/commands.js";

// .env ファイルから環境変数を読み込み
config();

const program = createProgram();
program.parse();
