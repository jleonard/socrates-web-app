export async function action({ request }: ActionFunctionArgs) {
  const form = await request.formData();
  const key = form.get("key") as string;
  await redis.del(key);
  return data({ deleted: key });
}
