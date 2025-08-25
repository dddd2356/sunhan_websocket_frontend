import {ResponseDto} from "../apis/response";

type ResponseBody <T> = T | ResponseDto | null;

export type{
    ResponseBody,
}