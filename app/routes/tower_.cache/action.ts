import { getRedis } from "~/utils/redis.server";
import { redirect, data, type ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  const redis = await getRedis();
  const form = await request.formData();
  const key = form.get("key") as string;
  await redis.del(key);
  return data({ deleted: key });
}
