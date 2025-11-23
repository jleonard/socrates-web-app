import { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  //const body = await request.formData();
  return new Response("Okay", { status: 200 });
}
