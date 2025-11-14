import { useLoaderData } from "react-router";
import { CircleImage } from "components/CircleImage/CircleImage";
import type { loader } from "./loader";
import { Form } from "react-router";

export default function Purchase() {
  const { products } = useLoaderData<typeof loader>();

  return (
    <>
      <img
        className="absolute top-0 left-1/2 transform -translate-x-1/2 object-cover h-full"
        src="/images/purchase.png"
      />

      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col gap-4 w-full max-w-96">
        {/* Day Pass */}
        <Form method="post" className="w-full">
          <input type="hidden" name="productCode" value="day" />
          <button
            type="submit"
            style={{ cursor: "pointer" }}
            className="block w-full"
          >
            <div className="flex flex-row items-center justify-start w-full">
              {/* cost div */}
              <div className="flex flex-col gap-1 min-w-[116px]">
                <span className="font-bold text-[57px] leading-none">$2</span>
                <span className="text-lg">One Day</span>
              </div>
              {/* properties list */}
              <ul className="text-xs list-disc text-left ml-6 text-gray-300">
                <li>24 hour access</li>
                <li>Not a subscription</li>
              </ul>
              {/* okay */}
              <div className="bg-ayapi-pink text-white text-lg font-bold size-[79px] rounded-full flex items-center justify-center ml-auto">
                <span>OK</span>
              </div>
            </div>
          </button>
        </Form>
        <div className="w-full border-t border-white border-t-[0.5px]"></div>{" "}
        {/* Week Pass */}
        <Form method="post" className="w-full">
          <input type="hidden" name="productCode" value="week" />
          <button
            type="submit"
            style={{ cursor: "pointer" }}
            className="block w-full"
          >
            <div className="flex flex-row items-center justify-start w-full">
              {/* cost div */}
              <div className="flex flex-col gap-1 min-w-[116px]">
                <span className="block font-bold text-[57px] leading-none">
                  $10
                </span>
                <span className="text-lg block">One Week</span>
                <span className="text-ayapi-pink">60% discount</span>
              </div>
              {/* properties list */}
              <ul className="text-xs list-disc text-left ml-6 text-gray-300">
                <li>Pay for 3 days, enjoy 7.</li>
                <li>Not a subscription</li>
              </ul>
              {/* okay */}
              <div className="bg-ayapi-pink text-white text-lg font-bold size-[79px] rounded-full flex items-center justify-center ml-auto">
                <span>OK</span>
              </div>
            </div>
          </button>
        </Form>
      </div>
    </>
  );
}
