import type { MetaFunction } from "react-router";
import { Link } from "react-router";

export const meta: MetaFunction = () => [{ title: "WonderWay Access Expired" }];

export default function Expiration() {
  return (
    <>
      <img
        className="absolute top-0 left-1/2 transform -translate-x-1/2 object-cover h-full"
        src="/images/expiration.png"
      />

      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex flex-col gap-2 w-full max-w-80 items-center">
        <img className="block size-[38px]" src="/images/logo/nub.png" />
        <h2 className="text-3xl leading-8 text-white text-center mb-6 mx-auto">
          Thank you for exploring with WonderWay
        </h2>
        <p className="text-center leading-normal">
          <span className="text-[16px]">
            Your complementary time has expired. Share your thoughts in a
            two-minute survey and unlock more time.
          </span>
        </p>
        <Link
          to="/login"
          className="w-10/12 mt-[77px] px-6 py-3 border border-white text-white bg-black/55 rounded-full text-center pointer-events-auto"
        >
          Get Started
        </Link>
      </div>
    </>
  );
}
